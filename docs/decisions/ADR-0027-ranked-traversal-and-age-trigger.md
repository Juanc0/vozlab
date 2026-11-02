# ADR-0027 — The graph's read path: the ranked bounded CTE, the indexes, and the trigger that would reopen Apache AGE

- **Status**: Accepted
- **Date**: 2026-10-21
- **Supersedes**: nothing. It **extends** [ADR-0004](ADR-0004-bounded-sql-cte-age-deferred.md), which deferred Apache AGE; the deferral stands, and this ADR gives it a **measurable trigger** instead of a hope.
- **Relates to**: [ADR-0022](ADR-0022-relator-neighbour-lookup.md), [ADR-0002](ADR-0002-two-physical-databases.md)

## Context

The graph lives in two relational tables — `public.nodes` and `public.edges` —
in the tenant database. It is read by three routes: the subgraph
(`GET /api/v1/nodes/subgraph`), the exploration window
(`GET /api/v1/nodes/window`) and the vector neighbours
(`GET /api/v1/nodes/:id/neighbors`).

Two questions were open: **what "the nearest nodes" means**, and **whether
Apache AGE should carry the traversal**.

The review of 2026-10-21 established:

- The subgraph's recursive CTE joined a `LATERAL` **without an `ORDER BY`**.
  When a node had more neighbours than the limit, PostgreSQL returned
  whatever the index scan produced and the rest was silently discarded. The
  route answered "200 reachable nodes", not "the nearest".
- `public.nodes` had **no index on `created_at`**, so the window and the
  keyset list **sorted the whole workspace** on every request. Measured on
  a synthetic tenant with 50 000 nodes and 200 000 relations: **160 ms**,
  with a `Limit → Sort → Seq Scan` plan.
- Apache AGE was **installed and empty**: the extension and the graph
  `vozlab_graph` exist in the tenant database, but nothing mirrors the
  nodes and the relations into it and no query emits Cypher. The image
  `apache/age:release_PG18_1.8.0` also loads the extension in **every**
  backend, whether it is used or not.

## Decision

### 1. The ranking rule

**"The nearest" is the strongest relation first, and among equals the most
recent**: `community_score DESC, created_at DESC`.

The rule applies to **both** arms of the `LATERAL` — the neighbours reached
forward and the ones reached backward — and the traversal carries the
strength and the instant of the relation that reached each node, so the
answer is cut by strength (`depth ASC, score DESC, reached_at DESC,
id ASC`).

The rule is a **product** decision, not a technical one: in a community
knowledge graph, the relation the community has already backed is the one
that says something, and among those the freshest is the one that is still
alive. A relation nobody has voted on is not "nearby", it is merely
adjacent.

Two traps, both measured, are part of the decision:

- Drizzle's `.desc()` emits `DESC NULLS LAST`, which **cannot serve** a
  plain `ORDER BY … DESC`: the planner fell back to sorting every relation
  of the node (495 ms). The index needs `.desc().nullsFirst()`.
- Ordering the **whole recursive step** instead of its arms forces the
  planner to materialise the whole frontier before applying its `LIMIT`:
  8.3 ms → 346 ms. The ranking stays **inside** the arms.

### 2. The indexes

| index | shape | action |
| --- | --- | --- |
| `idx_nodes_workspace_created` | `nodes (workspace_id, created_at DESC, id DESC) WHERE deleted_at IS NULL` | new |
| `idx_edges_workspace_source_ranked` | `edges (workspace_id, source_node_id, community_score DESC, created_at DESC) WHERE deleted_at IS NULL` | **replaces** `idx_edges_workspace_source` |
| `idx_edges_workspace_target_ranked` | idem for `target_node_id` | **replaces** `idx_edges_workspace_target` |

They **replace** the old edge indexes rather than joining them: the new
ones keep the old prefix, so every query the old ones served is still
served, and the index count and the write amplification stay the same.

### 3. Apache AGE stays deferred, with a trigger

AGE is **not** adopted. The reasons, in the order of their weight:

1. **AGE is a query language, not a concurrency mechanism.** Its
   concurrency behaviour is PostgreSQL's MVCC: two simultaneous writes are
   last-write-wins. The product's concurrency problem is solved elsewhere
   ([ADR-0028](ADR-0028-optimistic-concurrency.md)), in the layer the code
   already has.
2. **The evidence does not show Cypher beating the bounded CTE for this
   shape.** The AGE Forge benchmark (2025-01) reports AGE **21× slower** on
   edge traversal; a published `EXPLAIN (ANALYZE, BUFFERS)` comparison
   gives the recursive CTE 1.6 ms against Cypher's 6.6 ms on a 4-hop
   traversal, with AGE's plan degrading to a join filter instead of an
   index probe; GitLab's own evaluation concluded that "AGE doesn't seem
   to scale well".
3. **It closes the managed-PostgreSQL door.** AGE is absent from the
   extension allow-lists of RDS, Aurora, Cloud SQL and Supabase, and
   `pg_upgrade` is not supported with it — so a major PostgreSQL upgrade
   would be a dump/restore **per tenant database**.
4. **The mirror is where the cost is**: a second write path, a
   reconciliation, a backfill, and a permanent consistency hazard.

**The trigger that reopens the question** — any one of:

- a load test over a synthetic tenant of **1 000 000 nodes and 3 000 000
  relations** shows `GET /api/v1/nodes/subgraph?depth=3` with a **p95
  above 300 ms** *with the CTE already tuned* (these indexes, a raised
  `recursive_worktable_factor`, a raised `work_mem`) — the CTE is then
  provably the bottleneck, not the shape of the query;
- a requirement the CTE **cannot express** appears in the requirements as
  an FR and not as a wish: the shortest path between two nodes, all the
  paths of length ≤ k across relation types, or the common neighbours of
  two nodes;
- a requirement for **cross-institution analytics** appears, which
  [ADR-0002](ADR-0002-two-physical-databases.md) forbids today. The answer
  to that one is a separate analytical store, not AGE inside the tenant
  databases.

Until a trigger fires, the extension stays **deferred** — and the image
stops depending on it, because a dependency that buys nothing is a
dependency.

### 4. The operational hole this batch does not close

The tenant migrations are applied to **one** database: `drizzle.tenant.config.ts`
points at a single database through the environment. **There is no runner
for a fleet of tenant databases.** So every index added here has to be
applied to every tenant database by an operator, by hand:

```bash
TENANT_DB_HOST=$HOST TENANT_DB_PORT=5432 TENANT_DB_USER=$USER \
TENANT_DB_PASSWORD=$PASS TENANT_DB_NAME=$TENANT_DB \
  pnpm --filter @vozlab/database db:migrate:tenant
```

A fleet migration runner is its own roadmap item. Until it exists, "one
migration per tenant database" is a manual, error-prone, N-times operation.

## Consequences

- "The nearest nodes" is a **defined, documented and tested** notion
  instead of an accident of the index order.
- The window and the keyset list stop sorting the workspace: **160 ms →
  0.57 ms** on 50 000 nodes, and the plan becomes an index scan.
- The graph's read path has **no new dependency**, and the AGE coupling of
  the database image can be dropped.
- The `LIMIT` of the traversal still bounds the working set, and the
  **depth cap stays at 3**: it is a policy, not a technical limit, and it
  is not raised without the measurement above.

## The measurements

`EXPLAIN (ANALYZE, BUFFERS)`, median of 5, on a synthetic tenant with
50 000 nodes and 200 000 relations and 50 hubs of 950 neighbours each:

| read | before | after |
| --- | --- | --- |
| `window?limit=100` | 160.0 ms — `Limit → Sort → Seq Scan` (7 503 buffers) | **0.57 ms** — `Limit → Index Scan` (14 buffers) |
| `nodes?limit=20` | 163.1 ms — `Sort → Seq Scan` | **0.145 ms** — `Index Scan` |
| `subgraph?depth=2` | 9.14 ms | 8.36 ms (unranked) / **11.32 ms** (ranked) |

On the demo (24 nodes, 35 relations) the plan does not change — a seq scan
of one page is cheaper — and every endpoint answers in 8–11 ms. The cliff
only appears at scale, which is exactly why the index exists and why the
plan is asserted in the integration suite: a migration that was never
applied, or an index that stops being used, **fails a test**.
