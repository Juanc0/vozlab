# Domain Model

VozLab uses **two physically separate PostgreSQL databases**: a global router
database and one database per tenant. That split is the primary isolation
boundary; `workspace_id` is a second, logical partition *inside* a tenant
database. Scoping rules are in [Conventions](conventions.md).

Sources: `packages/database/src/schema/router.schema.ts`,
`tenant.auth.schema.ts`, `tenant.meta.schema.ts`, `tenant.public.schema.ts`,
`tenant.social.schema.ts`, `migrations/{router,tenant}/*.sql`, and the entities
in `apps/api/src/domain/entities/`.

## 1. Database topology

| Database | Dev name | Schemas | Purpose |
| --- | --- | --- | --- |
| Router | `vozlab_router` | `public` | Global tenant registry, physical connection config and the event-code registry (documented exception, ADR-0019). |
| Tenant (one per institution) | `vozlab_tenant_dev` | `auth`, `meta`, `public`, `social` | Identity, ontology, graph and social data for one tenant. |

The router database never contains graph tables; the tenant database never
contains the registry. `tid` is the internal tenant UUID from `public.tenants.id`
and is passed to every repository method so the pool manager resolves the
correct physical database. The JWT `tid` claim is an **OIDC identifier string**
(for example `sabana`), not the internal UUID.

## 2. Router database

| Table | Columns / constraints |
| --- | --- |
| `public.tenants` | `id` uuid PK; `slug` varchar(100) UNIQUE; `oidc_tenant_id` varchar(255) UNIQUE (matched against the validated `tid`/`hd` claim); `name`; `description` nullable; `provisioned` boolean default `true`; `created_at`, `updated_at`. |
| `public.tenant_connections` | `id` uuid PK; `tenant_id` FK → `tenants.id` ON DELETE CASCADE; `host`, `database`, `user`; `port` default `5432`; `password`; timestamps. |
| `public.event_codes` | `id` uuid PK; `tenant_id` FK → `tenants.id` ON DELETE CASCADE; `workspace_id` uuid (no FK: workspace lives in the tenant DB); `code_hash` varchar(64) UNIQUE; `label` nullable; `expires_at`; `max_uses` nullable; `used_count` default 0; `revoked_at` nullable; `created_by_hash`; `created_at`. |

`tenant_connections.tenant_id` has no UNIQUE constraint: the application reads
the first matching row and assumes one connection per tenant. The
`provisioned` flag is not consulted by the current code; provisioning is
inferred from the presence of a tenant row and a connection row.

`event_codes` is the **only** router table outside the tenant/connection pair
([ADR-0019](decisions/ADR-0019-global-event-codes.md)). A QR is scanned before
the tenant is known, so the raw code is hashed and looked up globally; the row
points at the tenant and workspace. The CLI validates the workspace in the
tenant DB before inserting, but there is no cross-database FK.

## 3. Tenant database

### 3.1 `auth` — identity and workspaces

| Table | Key columns | Constraints / notes |
| --- | --- | --- |
| `auth.workspaces` | `id`, `slug`, `name`, `description`, `is_public`, `created_at` | `slug` UNIQUE; `is_public` defaults `true`; no `updated_at`. |
| `auth.users` | `id`, `email`, `full_name`, `provider`, `provider_user_id`, `author_hash`, `anonymous_alias`, `system_role`, `created_at` | `email` UNIQUE and nullable; `author_hash` varchar(64) NOT NULL UNIQUE; `UNIQUE(provider, provider_user_id)` (`uniq_users_provider_provider_user`) lets concurrent OIDC callbacks upsert safely. `provider`: `OIDC_INSTITUTIONAL` or `ANONYMOUS_EVENT`. `system_role` defaults `USER` (`USER`, `ADMIN`, `MODERATOR`, `SYSTEM_AGENT`, not DB-constrained). |
| `auth.workspace_memberships` | `id`, `workspace_id`, `user_id`, `role`, `created_at` | FKs to workspaces/users, ON DELETE CASCADE. `role` defaults `MEMBER` (`ADMIN`, `MODERATOR`, `MEMBER`). `UNIQUE(workspace_id, user_id)` (`uniq_memberships_workspace_user`); the role lookup returns one row. |
| `auth.refresh_tokens` | `id`, `user_id`, `family_id`, `token_hash`, `expires_at`, `created_at`, `revoked_at` | FK `user_id` → `auth.users` ON DELETE CASCADE; `token_hash` varchar(64) UNIQUE (SHA-256 only); indexes on user, family and expiry. Rotation revokes the old row and inserts a sibling; reuse revokes the family ([ADR-0018](decisions/ADR-0018-oidc-jit-hybrid-sessions.md)). |

OIDC login upserts `auth.users` just-in-time with a random `author_hash` but
does **not** create a membership. Event join creates an `ANONYMOUS_EVENT` user
and a `MEMBER` membership in the code's workspace inside one tenant
transaction. These rules are described in
[auth-and-tenancy.md](auth-and-tenancy.md).

`author_hash` is an **opaque 64-hex pseudonym assigned once per user**. It is
stored on `auth.users`, carried verbatim in the JWT `authorHash` claim and
copied to graph rows. The API never derives or re-hashes it and **there is no
salt**. Because the value is copied to rows, changing a user's pseudonym means
updating those rows (a targeted data migration), but there is no salt to
rotate. See [ADR-0013](decisions/ADR-0013-random-opaque-pseudonym.md).

### 3.2 `meta` — ontology metamodel

| Table | Key columns | Constraints / notes |
| --- | --- | --- |
| `meta.ontology_classes` | `id`, `workspace_id`, `system_key`, `display_names`, `descriptions`, `parent_class_key`, `status`, `proposed_by`, `created_at` | `workspace_id` nullable FK → `workspaces` ON DELETE CASCADE. **UNIQUE(`workspace_id`, `system_key`)** (`uniq_ontology_classes_workspace_key`, migration `tenant/0002_big_bug.sql`). `parent_class_key` is logical, not an FK. |
| `meta.datatype_properties` | `id`, `workspace_id`, `system_key`, `display_names`, `descriptions`, `datatype`, `allowed_values`, `is_required`, `default_value`, `domain_class_key`, `status`, `proposed_by`, `created_at` | `datatype` defaults `string` (`string`, `number`, `boolean`, `date`, `enum`). `domain_class_key` logically references a class; no FK. Index on (`workspace_id`, `domain_class_key`). `system_key` is **not** unique. |
| `meta.object_properties` | `id`, `workspace_id`, `system_key`, `display_names`, `descriptions`, `domain_class_key`, `range_class_key`, `is_directional`, `is_symmetric`, `allows_self_relation`, `status`, `proposed_by`, `created_at` | Domain/range keys are logical, not FKs. Index on (`workspace_id`, `domain_class_key`, `range_class_key`). `system_key` is **not** unique. |

`workspace_id` is nullable in all three tables, but every application write
supplies it. Lifecycle is status-based (`PROPOSED`, `ACTIVE`, `REJECTED`), not
soft deletion. `display_names` and `descriptions` are JSONB locale maps, e.g.
`{"es":"...","en":"..."}`.

### 3.3 `public` — graph and governance

| Table | Key columns | Constraints / notes |
| --- | --- | --- |
| `public.nodes` | `id`, `workspace_id`, `type_key`, `title`, `description`, `attributes`, `embedding`, `author_hash`, `status`, `community_score`, `created_at`, `updated_at`, `deleted_at` | `type_key` logically references `meta.ontology_classes.system_key`; no FK. `embedding` is `vector(768)`, nullable, HNSW cosine index. Partial (`deleted_at IS NULL`) workspace/status index; GIN on `attributes`. |
| `public.edges` | `id`, `workspace_id`, `source_node_id`, `target_node_id`, `relation_key`, `attributes`, `status`, `community_score`, `author_hash`, `created_at`, `deleted_at` | Source/target FKs → `nodes.id` ON DELETE CASCADE (hard delete only). `relation_key` logically references `object_properties.system_key`; no FK. Partial workspace/source and workspace/target indexes. |
| `public.edit_proposals` | `id`, `workspace_id`, `target_id`, `target_type`, `proposer_hash`, `proposed_changes`, `justification`, `community_score`, `status`, `resolved_by`, `resolved_at`, `created_at` | `target_type`: `NODE`, `EDGE`, `ONTOLOGY`. `target_id` is **polymorphic and has no FK** (decision M-12). No `deleted_at`, no `updated_at`. |
| `public.interactions_log` | `id`, `workspace_id`, `user_hash`, `target_id`, `target_type`, `interaction_type`, `value`, `created_at` | `target_type`: `NODE`, `EDGE`, `PROPOSAL`, `POST`. UNIQUE(`user_hash`, `target_id`, `target_type`) — one vote per user/target. `value` is server-derived. Immutable: no update/delete path. |

`nodes.embedding` is currently always `NULL`: nothing computes embeddings.
`NODE_CREATED` is published, but no worker handler consumes it yet. ADR-0020
defines the dedicated embedder and the future agent-only write endpoint; the
shared runtime and embedder scaffold exist, but the handler is milestone 2.4.

### 3.4 `social` — discussions

| Table | Key columns | Constraints / notes |
| --- | --- | --- |
| `social.discussion_threads` | `id`, `workspace_id`, `target_id`, `target_type`, `title`, `status`, `created_by_hash`, `created_at`, `updated_at` | `target_type`: `NODE`, `EDGE`, `PROPOSAL`, `ONTOLOGY`. `target_id` polymorphic; no FK. No `deleted_at`. |
| `social.discussion_posts` | `id`, `thread_id`, `parent_post_id`, `author_hash`, `body`, `upvotes`, `downvotes`, `community_score`, `created_at`, `deleted_at` | `thread_id` FK → threads ON DELETE CASCADE. `parent_post_id` is a logical self-reference; **no FK**. Posts have **no `workspace_id`**; they are scoped through the thread. |

## 4. Relationships and referential integrity

| Relationship | Enforced by | Consequence |
| --- | --- | --- |
| workspace → nodes, edges, proposals, interactions, ontology rows, threads | FK `workspace_id` ON DELETE CASCADE | Hard-deleting a workspace removes its tenant data. |
| thread → posts | FK `thread_id` ON DELETE CASCADE | Hard-deleting a thread removes posts. |
| node → edges | FKs source/target ON DELETE CASCADE | Hard-deleting a node removes incident edges; **soft delete does not**. |
| author pseudonyms (`author_hash`, `proposer_hash`, `resolved_by`, `created_by_hash`, `user_hash`, `proposed_by`) | none | Logical references to `auth.users.author_hash`; deleting a user leaves content intact. |
| ontology keys, relation keys, domain/range keys, proposal/discussion targets | none | Validated in use cases, not by the database. |

### Polymorphic targets (M-12)

`edit_proposals.target_id` intentionally has **no foreign key**: one column can
point at a node, an edge or an ontology class. A single FK cannot express that
union, and three nullable FKs would weaken the exactly-one-target invariant.
The decision is to:

- validate the target at creation (`existsInWorkspace` for NODE/EDGE,
  `findClassById` for ONTOLOGY);
- re-resolve the target before approve/reject and fail closed if it is gone;
- never add a partial FK covering only one target type.

Discussion threads use the same pattern. `CreateThreadUseCase` stores the target
without an existence check; proposals are stricter. See
[ADR-0008](decisions/ADR-0008-cross-workspace-404.md) for the 404 rule.

## 5. Status unions and state machines

**Node** (`domain/entities/Node.ts`): `DRAFT | PENDING | ACTIVE | MERGED |
DEPRECATED | REJECTED`, default `PENDING`.

| From | Allowed to |
| --- | --- |
| `DRAFT` | `PENDING`, `ACTIVE` |
| `PENDING` | `ACTIVE`, `REJECTED` |
| `ACTIVE` | `MERGED`, `DEPRECATED` |
| `MERGED`, `DEPRECATED`, `REJECTED` | terminal |

The domain method is `changeStatus`. The API always creates nodes `PENDING` and
exposes **no endpoint** to advance node status; proposal approval does not
change it either.

**Edge** (`domain/entities/Edge.ts`): `DRAFT | PENDING | ACTIVE | REJECTED`,
default `PENDING`. `DRAFT → PENDING | ACTIVE`; `PENDING → ACTIVE | REJECTED`;
`ACTIVE → REJECTED`; `REJECTED` is terminal. `changeStatus` exists, but no HTTP
route transitions edges.

**EditProposal** (`domain/entities/EditProposal.ts`): `PENDING |
APPROVED_BY_AUTHOR | REJECTED_BY_AUTHOR | AUTO_APPLIED`, default `PENDING`.

| From | To | Trigger |
| --- | --- | --- |
| `PENDING` | `APPROVED_BY_AUTHOR` | Target maintainer calls `PUT /proposals/:id/approve`; delta applied atomically. |
| `PENDING` | `REJECTED_BY_AUTHOR` | Target maintainer calls `PUT /proposals/:id/reject`; target untouched. |
| `PENDING` | `AUTO_APPLIED` | `MODERATOR`/`ADMIN` calls `PUT /proposals/:id/auto-apply` after ≥ 14 days **and** `community_score >= 10`. |
| resolved states | — | Terminal. |

Approval and auto-apply apply the delta and update the status in one
`UnitOfWork` transaction; rejection only updates the status.

**Ontology** (`OntologyClass`, `DatatypeProperty`, `ObjectProperty`):
`PROPOSED | ACTIVE | REJECTED`, default `PROPOSED`. `PROPOSED → ACTIVE` via
`PUT /ontology/classes/:id/activate`; `PROPOSED → REJECTED` exists only in the
domain. `ACTIVE` and `REJECTED` are terminal. Only classes have an activation
route, so properties proposed through the API stay `PROPOSED`; `GET /ontology`
returns only `ACTIVE` object properties.

**DiscussionThread** (`domain/entities/DiscussionThread.ts`): `OPEN | CLOSED`,
default `OPEN`. `OPEN → CLOSED` via the creator-only
`PUT /discussions/:threadId/close`; closing an already closed thread is an
invalid transition.

## 6. Soft-delete policy

| Table | Mechanism | Read filter | Single writer | HTTP delete |
| --- | --- | --- | --- | --- |
| `nodes` | `deleted_at` | `findById`, `findByIdInWorkspace`, list, subgraph CTE, `applyDelta`, interaction target lookup | `DrizzleNodeRepository.softDelete` | `DELETE /nodes/:id` (author only, 204) |
| `edges` | `deleted_at` | `findById`, `findByIdInWorkspace`, list, subgraph, `applyDelta`, interaction target lookup | `DrizzleEdgeRepository.softDelete` | `DELETE /edges/:id` (author only, 204) |
| `discussion_posts` | `deleted_at` | `findPostById`, `listPosts`, interaction target lookup | `DrizzleDiscussionRepository.softDelete` | `DELETE /discussions/posts/:id` (author only, 204) |
| `discussion_threads` | `status = CLOSED` | No `deleted_at`; all rows readable | `update` after `close()` | `PUT /discussions/:threadId/close` (creator only) |
| `edit_proposals` | `status` | No `deleted_at` | `updateStatus` | none |
| `meta.ontology_*` | `status` | Consumers ask for `ACTIVE` | `activateClass` / status column | none |
| `interactions_log` | none — immutable | n/a | insert only | none |

- `deleted_at` is a persistence concern: only `softDelete` stamps it. The
  domain entity exposes it read-only.
- A soft-deleted row reads as not found; repeating a delete returns 404, which
  is idempotent from the client's perspective.
- A foreign-workspace row also reads as 404, never 403.
- Soft-deleting a node does **not** delete or mutate its edges.

## 7. Interaction uniqueness and scoring

- UNIQUE(`user_hash`, `target_id`, `target_type`) is the database backstop.
  `workspace_id` is not part of the key because a user hash is unique per
  tenant database.
- `CastVoteUseCase` checks for an existing interaction first. The same
  `interactionType` is idempotent and returns the existing row; a different
  type returns `409 ERR_DUPLICATE_INTERACTION`.
- `VoteValue` maps `DOWNVOTE → -1` and `UPVOTE`/`SUPPORT`/`VALIDATE → +1`.
  Clients never send the numeric value.
- The insert and target counter update share one transaction. `applyScoreDelta`
  uses SQL-level `+=`, not read-modify-write. Posts keep `upvotes`, `downvotes`
  and `community_score` coherent; nodes, edges and proposals update
  `community_score`.

## 8. Apache AGE and the subgraph read path

The custom PostgreSQL image includes Apache AGE and the tenant startup script
creates `vozlab_graph`. **No code mirrors `nodes`/`edges` into AGE and no
adapter issues Cypher.** This is deliberate: dual-write, backfill and
reconciliation belong to a separate milestone
([ADR-0004](decisions/ADR-0004-bounded-sql-cte-age-deferred.md)).

The read path is a **bounded recursive SQL CTE** over `public.edges` in
`DrizzleNodeRepository.getSubgraph`:

- traversal is undirected (both source and target directions);
- `depth` is capped at 3 and `limit` at 200;
- every step filters `workspace_id` and `deleted_at IS NULL`;
- the node set is de-duplicated, ordered shallowest-first, and only edges with
  both endpoints in the set are returned.

`GET /api/v1/nodes/subgraph` is the only consumer. See
[API reference](api-reference.md#3-nodes).

## 9. Known schema-level limits

- `meta.datatype_properties.system_key` and
  `meta.object_properties.system_key` are not unique; `findObjectProperty`
  returns the first match.
- `router.event_codes.workspace_id` has no FK to the tenant DB; deleting a
  workspace directly can leave a stale code until it is revoked.
- `auth.refresh_tokens` rows are cleaned opportunistically during rotation:
  expired rows and revoked rows older than seven days are deleted for that
  user. There is no global cleanup job.
- `discussion_posts.parent_post_id` is not FK-constrained and the use case does
  not verify that the parent belongs to the same thread.
- `edit_proposals.target_id` and `discussion_threads.target_id` are polymorphic
  (M-12); only proposals validate target existence at creation.
- `meta.*.workspace_id` is nullable although the application always writes it.

Related: [Conventions](conventions.md) · [API reference](api-reference.md) ·
[Errors](errors.md).
