# 05 — Data and database

This file covers the data model as built, the vector and graph read paths, how schemas change, how a fleet of
per-institution databases is operated (today and what it needs), backup and recovery, personal data, and the
database architecture options with a recommendation.

## 1. Topology

| Database | Dev name | Contents | Count in production | Owner today |
| --- | --- | --- | --- | --- |
| Router | `vozlab_router` | `tenants`, `tenant_connections` (plaintext password column), `event_codes` (hashed codes) | One | Manual SQL and CLI |
| Tenant | `vozlab_tenant_dev` | Schemas `auth` (4 tables), `meta` (4), `public` (4 graph and governance tables), `social` (2) | One per institution | Migrations run by an environment-driven CLI against one database at a time |

Facts that shape operations: [repo] `docs/architecture.md`, ADR-0002, ADR-0019, ADR-0027 §4

- The router holds no graph content; each tenant holds no routing data. `event_codes` is the one documented
  exception (ADR-0019).
- There are no cross-database foreign keys or joins. A request resolves its tenant once, then works inside one
  database.
- Workers never connect to a tenant database. They reach it only through the API. This is a strong property:
  the number of database connections is governed by the API alone.

## 2. Schema as built

**Router.** `tenants(id, slug, oidc_tenant_id UNIQUE, name, provisioned, …)`, `tenant_connections(tenant_id,
host, port, database, user, password, …)`, `event_codes(tenant_id, workspace_id, code_hash UNIQUE, expires_at,
max_uses, used_count, revoked_at, …)`. [repo] `router.schema.ts`

**Tenant.**

| Schema | Tables | Notes |
| --- | --- | --- |
| `auth` | `users`, `workspaces`, `workspace_memberships`, `refresh_tokens` | `users.author_hash` is unique and random (ADR-0013). Memberships are unique per user and workspace. Refresh tokens are stored as SHA-256 hashes. |
| `meta` | `ontology_classes`, `datatype_properties`, `object_properties`, `data_sources` | Lifecycle by `status`, not deletion. Display names are locale maps (`{"en":…,"es":…}`). Property `system_key` is not unique (F-16). |
| `public` | `nodes`, `edges`, `edit_proposals`, `interactions_log` | Soft delete on nodes and edges (`deleted_at`). `nodes.embedding vector(768)` with an HNSW index. Edges reference nodes with cascade. Proposal targets are polymorphic and have no foreign key (M-12). |
| `social` | `discussion_threads`, `discussion_posts` | Posts are scoped through the thread; they carry no `workspace_id`. |

Integrity gaps that are known and accepted, plus two that are not written down:

| Gap | Effect | Status |
| --- | --- | --- |
| Polymorphic `target_id` in proposals and threads, no foreign key | An orphaned target is possible; proposals validate at creation and re-resolve before approval; threads do not validate at all. | Accepted (M-12). Threads inconsistent with proposals. |
| `discussion_posts.parent_post_id` has no foreign key and no same-thread check | A reply can point into another thread. | **Not in the known-gaps list.** |
| `meta.*.workspace_id` nullable | A row can exist without a workspace, although the application always writes it. | Known. |
| `meta.*.system_key` not unique for properties | `findObjectProperty` returns the first match. | Known (F-16). |
| Refresh-token cleanup is opportunistic (during rotation, for the same user) | Rows of inactive users are never removed. Table growth is unbounded. | Known. |
| `router.event_codes.workspace_id` has no foreign key | A deleted workspace leaves a live code until revoked. | Known. |

## 3. The read paths and their indexes

| Path | Query shape | Index | Evidence |
| --- | --- | --- | --- |
| Subgraph (`/nodes/subgraph`) | Recursive CTE over edges, depth ≤ 3, limit ≤ 200, both directions, ranked by strength then recency | `idx_edges_workspace_source_ranked`, `idx_edges_workspace_target_ranked` (partial, `deleted_at IS NULL`) | ADR-0004, ADR-0027. Not measured against NFR-01. |
| Window (`/nodes/window`) | Newest nodes of a workspace with the relations among them | `idx_nodes_workspace_created (workspace_id, created_at DESC, id DESC)` | ADR-0027: 160 ms to 0.57 ms on 50 000 nodes, synthetic data. |
| Neighbours for the Relator | Top five by cosine distance within a workspace, status in `ACTIVE`/`PENDING`, excluding deleted | `idx_nodes_embedding_hnsw` (global) | Plan not measured on multi-workspace data (see F-04, section 4). |
| Votes | Unique per user and target | `unique_user_target_vote` | Constraint-enforced. |

Measurement caveat: the 0.57 ms figure is on synthetic data with one workspace shape. Real institutional
graphs will have different skew. The ADR's trigger (1 million nodes and 3 million relations with p95 above
300 ms) is the right way to decide when to act, and it has not been run.

## 4. Vector search: the recall problem (F-04)

pgvector's HNSW index returns candidates first and applies `WHERE` filters afterwards. The number of candidates
is governed by `hnsw.ef_search`, whose default is 40. If a filter keeps 10% of rows, about four of the 40
candidates survive on average, even when the query asks for five. pgvector 0.8.0 added iterative index scans
(`hnsw.iterative_scan`) to continue the scan until enough rows survive, bounded by `hnsw.max_scan_tuples`. [web]
pgvector README and release notes.

The Relator's neighbour query has exactly this shape: a workspace filter, a status filter and a deleted filter
after an index scan over the **whole** table. Three consequences:

1. In a small test database the planner often skips the index and sorts exactly, so tests pass. The failure
   appears when the table grows past the planner's threshold, which is the situation a pilot will reach.
2. In a tenant with several workspaces, a workspace that is small relative to the table gets fewer than five
   neighbours, silently.
3. The Relator does not fail; it reasons over fewer neighbours and may conclude `INDEPENDENT` wrongly.

**Recommended fix (judgment):**

- Run the neighbour query inside a transaction that sets `SET LOCAL hnsw.iterative_scan = relaxed_order` and a
  suitable `hnsw.ef_search`. `SET LOCAL` only exists inside a transaction, so the repository must open one.
- Add an **integration test** on a dataset with many workspaces and a skewed size distribution. Compare the
  approximate top five with an exact result (`SET enable_indexscan = off`) and require recall of at least 0.95.
  This test is the evidence; the fix is secondary.
- Confirm the deployed pgvector version is 0.8.0 or later in every target environment. The Dockerfile takes it
  from the PostgreSQL apt repository, so it is not pinned by the repository. [repo] `docker/postgres/Dockerfile`
- Later, if one workspace dominates a tenant, consider partitioning the nodes table by workspace or a partial index
  for very large workspaces. Not needed yet.

**Dimension change (if the embedding model changes, see `06`):** the column type is fixed at `vector(768)`. A
change to 1024 dimensions is a migration that drops the HNSW index, alters the column, rebuilds the index and
re-embeds every node. Storage for vectors is about 3 KB per 768-dimension float32 vector and about 4 KB for 1024
dimensions, before index overhead. At 100 000 nodes that is roughly 0.3 GB against 0.4 GB of raw vectors. The
`embedding_model` column (ADR-0020) lets the migration run in stages: write new vectors to a second column,
switch reads, then drop the old column.

## 5. Schema change: how migrations work, and where they stop

- **Tool:** Drizzle Kit 0.31 with Drizzle ORM 0.45. Two configs (router, tenant), journals and snapshots under
  `packages/database/migrations/`. Schemas in TypeScript are the source of truth (ADR-0003).
- **Scripts:** `db:generate`, `db:migrate`, `db:push`. `db:push` is guarded by an agent permission
  (`opencode.json`), which is a good idea.
- **Environment:** the tenant config reads one database from environment variables. There is no list of tenants.
- **Application:** the API never runs migrations. Good.
- **The gap:** ADR-0027 §4 says it plainly: indexes added to the tenant schema must be applied to every tenant
  database **by hand**. There is no runner, no version record per tenant, no lock, and no report of which tenant is
  behind.

**What a fleet migration runner needs (judgment):**

| Need | Minimum design |
| --- | --- |
| Inventory | Iterate `tenant_connections` (with an `active` flag). |
| Version record | A table in each tenant database (or in the router) with the applied migration hashes per tenant. |
| Concurrency control | An advisory lock per tenant; a global limit on parallel migrations. |
| Safety | Dry run that lists pending migrations per tenant; migrations are expand-then-contract (new column first, backfill, switch, then drop). |
| Online index creation | `CREATE INDEX CONCURRENTLY` for large tables; a flag on the migration. |
| Report | One line per tenant: version before, version after, duration, error. Machine-readable. |
| Rollback | Forward-only, with a documented restore path (section 8). Down migrations are not trusted at this scale. |
| Test | The runner is tested against three ephemeral databases in CI. |

Time to build this: about one to two weeks for a careful engineer [juicio]. It is a prerequisite for a second
institution, not for a demo.

## 6. Provisioning an institution today

Creating a tenant is a sequence of manual steps, most of them in the `packages/database/scripts` area and
run by hand:

1. Create the tenant database and the connection row in the router (`tenant_connections`, password in plain text).
2. Insert the tenant (`tenants`) with its OIDC identifier (`tid` or `hd`).
3. Run the tenant migrations against the new database.
4. Create the workspace(s) and the base ontology. The dev seed does this for `sabana`; there is no production
   equivalent.
5. Create the first administrator membership. **There is no route for this** (F-02); it is an SQL edit.
6. Create event codes for in-person use (`db:event-code`).

Each step is individually reasonable and the whole is error-prone. A provisioning command should be idempotent,
produce a report, and be exercised in CI on an empty router and an empty tenant database.

## 7. Connection budget (the arithmetic that will bite)

Each API replica keeps one pool per **active** tenant, with `max: 10` connections (`DATABASE_POOL_MAX`), idle
eviction after 30 minutes, and a router pool of up to 20. Workers use no tenant connections. [repo]
`ConnectionPoolManager.ts`, `.env.example`

Worst-case connections to tenant databases = active tenants × API replicas × 10.

| Active tenants | API replicas | Worst case | Comment |
| --- | --- | --- | --- |
| 1 | 2 | 20 | Comfortable. |
| 5 | 2 | 100 | Fine on a modest instance; check its limit. |
| 20 | 2 | 400 | Needs a deliberate instance size and a pooler. |
| 50 | 4 | 2 000 | Not feasible without a pooler; will fail under load. |

The real number is lower, because most pools are idle most of the time. Designing for the worst case is the
correct engineering stance, because it is what happens during a busy presentation or enrolment week.

`max_connections` on RDS PostgreSQL is derived from instance memory through a parameter formula. Check the
parameter group of the instance you choose, rather than relying on a number from memory. [supuesto]

**Recommendation:** put a transaction-mode pooler in front of the databases before the second institution.
Options are Amazon RDS Proxy (managed, per database endpoint, has a cost per vCPU-hour) or PgBouncer on ECS
(cheap, operated by you). Transaction pooling requires that the application does not depend on session state:
`SET LOCAL` inside transactions is safe, session-level `SET` is not, and prepared statements need checking.
The `pg` driver uses unnamed statements by default, which is compatible; verify it in the integration suite.

## 8. Backup, restore and recovery

| Question | Current answer | Gap |
| --- | --- | --- |
| Are there backups? | Not defined in the repository. Managed-service backups would apply only once deployed. | Entirely absent. |
| Recovery point and time objectives | Not defined. | Needed per institution (a contractual question). |
| Restore one institution | Would need a logical dump of its database. Instance-level point-in-time restore restores the whole instance. | Need per-tenant logical dumps (`pg_dump -Fc` per database) to object storage, with restore drills. |
| Restore the router | Same question; smaller. | Dumps of the router are essential because it holds the registry. |
| Redis | Streams and rate-limit counters are transient; refresh sessions live in the tenant DB. | Stream contents are not recoverable and need not be, if events are re-derivable (section 6 of `04`). |
| Data portability (export) | None. | Consider an export per workspace as a product feature; it is also a privacy obligation in many jurisdictions. |

**Recommended baseline (judgment):** nightly logical dumps of every tenant database and the router to an
encrypted bucket with object lock; monthly restore into a scratch environment; a restore time measured and
written down. Instance snapshots for disaster recovery in addition, not instead.

## 9. Personal data and erasure

The database holds personal data in `auth.users` (email, full name, provider subject, anonymous alias) and in
`auth.refresh_tokens` (hashed). The graph holds only pseudonyms. ADR-0013 is explicit that the pseudonym can be
mapped back by anyone with database access. [repo]

A request to erase a person creates a decision that has no answer in the code today:

| Option | What happens | Trade-off |
| --- | --- | --- |
| A. Delete the account row | The pseudonym becomes an orphan. Their nodes and votes remain, unattributable. Maintainer rights on their objects can no longer be exercised by anyone. | Simple. Objects become locked for approval (see F-01's maintainer rule). |
| B. Anonymise the account and rotate the pseudonym | Rows keep a new, unlinked pseudonym. Maintainer rights transfer to the new value only if rows are rewritten. | Requires rewriting every column that stores the pseudonym: about ten, across seven tables (`domain-model.md` §3). |
| C. Delete the contributions | Removes graph content on request. | Damages the community's shared knowledge. Rarely right. |

Option B is the most defensible default, but the choice is a policy decision with legal input (decision D-15 in
`15`). It must be made before the first real user, because the cost of retrofitting it grows with every row.

## 10. Pseudonymity: what it protects and what it does not

- It protects the **graph** from casual disclosure: the public API never shows names, emails or subjects.
- It does not protect against a database administrator. The mapping is in `auth.users` in the same database.
- It is **linkable**: one person's contributions are connected by a stable pseudonym, which is intended, because
  it is how maintainer rights and one-vote-per-person work.
- Cross-institution linkage does not happen today, because each institution has its own accounts and pseudonyms.
  Any future global identity layer would create cross-institution linkage, which is a privacy change, not only a
  technical one (`08`).

## 11. Database architecture options for many institutions

The current choice (ADR-0002) is database per tenant. Four credible options exist. The table compares them on the
criteria that matter for this product. [juicio]

| Criterion | A. Database per tenant (current) | B. Schema per tenant, one database | C. Shared tables with row-level security | D. Cluster per tenant |
| --- | --- | --- | --- | --- |
| Isolation strength | Strongest: physical | Medium: a shared database, separate namespaces | Medium-high: policy-enforced; a bug or a missing policy leaks data | Strongest |
| Sovereignty story ("your data in your database") | **Strong, concrete** | Weak | Weak | Strong, expensive |
| Migrations at N tenants | Fleet runner required | One migration, N schemas to iterate | One migration | Fleet runner, plus N clusters |
| Connection budget | Grows with tenants × replicas (needs pooler) | One pool | One pool | Per cluster |
| Backup granularity per tenant | Good (per database, logical dumps) | Hard (per schema; logical dumps possible) | Hard | Good |
| Noisy neighbours | Shared instance; isolated pools | Shared everything | Shared everything | Isolated |
| Cost at 5 tenants | Moderate | Low | Low | High |
| Cost at 200 tenants | Moderate, plus operations effort | Low | Low | Very high |
| Fit with the current code | Native | Requires changing the router and pools | Requires an extensive rewrite of repositories and a policy per table | Native, costly |
| Reversibility | Moving to B or C later is a data migration | | | |

**Recommendation:** keep **A** for the first institutions. The sovereignty story is a real selling point,
the code is built around it, and the cost at a handful of institutions is modest. Do three things with it:
place tenants on one to three instances through `tenant_connections` (the router already supports per-tenant
hosts, which is a free sharding lever); put a pooler in front; build the fleet runner. Reconsider **C** only
for a tier of very small tenants, and only with a documented row-level policy test suite. Never choose C for
the sovereignty tier. Reconsider the whole question if the number of institutions passes roughly one hundred.
That threshold is a judgment, not a measurement. [juicio]

## 12. Operating checklist (what a DBA needs written down)

- Create, migrate, verify and register a new tenant database (section 6).
- Rotate a tenant database credential, and move passwords out of the router table (F-06).
- Add an index to every tenant database without blocking writes (section 5).
- Restore one tenant from a logical dump; measure the time (section 8).
- Fail over the instance; confirm the pool recovers (the pool manager has no circuit breaker; verify).
- Upgrade PostgreSQL minor versions; upgrade pgvector; test HNSW index rebuild time on a copy of a large tenant.
- Monitor: connections per tenant, long transactions, table and index bloat, `pg_stat_statements` top queries,
  HNSW index size and build time, refresh-token table size.
- PostgreSQL major versions receive about five years of support [juicio]. PostgreSQL 18 is the target today; plan
  the next major after the first pilot, not during it.

## 13. Apache AGE in the database image (F-10)

The local image is built on `apache/age`, and the init script creates the `vozlab_graph` graph and its labels in
every dev tenant. [repo] `docker/postgres/Dockerfile`, `packages/database/scripts/02-extensions-and-graph.sql`
ADR-0027 states that the extension stays deferred and that **the image stops depending on it**. That step has not
been taken. Two consequences:

- The local database has an extension that production (Amazon RDS) cannot have. A local-only feature is a parity
  risk.
- The image is a third-party build with its own release cadence.

**Recommendation:** build the local image from the official PostgreSQL 18 image with pgvector only, remove the AGE
bootstrap from the init script, and record the removal in ADR-0027 as done. This is a small change that closes an
open decision.

## 14. What to measure before the pilot

1. Recall of the Relator's neighbour query against an exact answer, on a multi-workspace dataset (F-04).
2. Subgraph p95 at depth three, 200 nodes, on a realistic tenant (NFR-01).
3. Vote and node-create p95 at the expected concurrency (NFR-03).
4. Time to migrate one tenant, and time to restore one tenant (sections 5 and 8).
5. Connections in use per replica under a scripted load of N active tenants (section 7).

These numbers come from `k6` and from a seeded synthetic tenant, and they belong in the repository next to the
ADRs. The existing `db:seed:stress` referenced in the CI specification does not exist yet.
