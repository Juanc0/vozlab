# API Reference

HTTP contract of the Fastify API. Every route below is registered in
`apps/api/src/infrastructure/http/routes.ts`. Bodies and query strings are
validated with the Zod schemas in `packages/shared-types/src/schemas/`;
response projections are defined by the controllers. Errors are catalogued in
[Errors](errors.md).

- Base URL (local): `http://localhost:3000`
- API prefix: `/api/v1`; health probes are at `/health`
- Content type: `application/json`

## 1. Authentication and common headers

### Public auth routes

These routes do not take `Authorization` or `X-Workspace-ID`. Login, callback,
refresh and event join share a per-IP rate limit; logout is Bearer-protected.

| Method | Path | Input | Success |
| --- | --- | --- | --- |
| `GET` | `/api/v1/auth/login` | `redirect?` same-origin path (default `/`) | `302` to the IdP |
| `GET` | `/api/v1/auth/callback` | `code`, `state` (query) | `302` to `WEB_ORIGIN + redirect` and `Set-Cookie: vozlab_refresh` |
| `POST` | `/api/v1/auth/refresh` | refresh cookie; no body | `200 AuthSessionDto` and a rotated cookie |
| `POST` | `/api/v1/auth/event-join` | `{ code: string(16–128), alias?: string(1–100) }` | `200 AuthSessionDto` and a refresh cookie |
| `POST` | `/api/v1/auth/logout` | Bearer; refresh cookie optional | `204`, cookie cleared |
| `GET` | `/api/v1/auth/me` | Bearer; **no** workspace header | `200 AuthMeDto` |

`AuthSessionDto`:

```json
{
  "accessToken": "eyJ...",
  "expiresAt": "2026-10-19T12:15:00.000Z",
  "user": {
    "id": "uuid",
    "email": "ada@example.edu",
    "fullName": "Ada Lovelace",
    "anonymousAlias": null,
    "provider": "OIDC_INSTITUTIONAL",
    "systemRole": "USER",
    "authorHash": "64-hex"
  }
}
```

`AuthMeDto` is the same `user` object plus
`workspaces: [{ id, slug, name, role }]`. The list may be empty for a valid
institutional login that has no membership yet.

- The access token is a 15-minute HS256 JWT returned in JSON; the future PWA
  keeps it in memory. The refresh cookie is `HttpOnly`, `SameSite=Lax`, scoped
  to `/api/v1/auth`, and rotated on every refresh. Send
  `credentials: 'include'` to auth routes.
- `/auth/callback` failures redirect to
  `${WEB_ORIGIN}/auth/callback?error=<CODE>`; it never returns a token in the
  URL. Invalid `state` → `ERR_INVALID_OIDC_STATE`; IdP/ID-token failure →
  `ERR_OIDC_EXCHANGE_FAILED`; unverified email → `ERR_EMAIL_NOT_VERIFIED`.
- Event join returns `ERR_EVENT_EXPIRED` for unknown/revoked/expired codes and
  `ERR_EVENT_FULL` at capacity. The QR contains only the code; see the
  [runbook](runbook-dev.md) for `db:event-code`.
- Refresh reuse revokes the whole family and returns
  `401 ERR_REFRESH_TOKEN_INVALID`. Agents never receive a refresh session.
- The full contract is in [auth-and-tenancy.md](auth-and-tenancy.md).

### Protected resource headers

Every resource route (nodes, edges, proposals, ontology, discussions,
interactions) requires:

| Header | Value |
| --- | --- |
| `Authorization` | `Bearer <JWT>` (HS256, signed with `JWT_SECRET`) |
| `X-Workspace-ID` | Workspace UUID (`auth.workspaces.id`) |
| `Content-Type` | `application/json` when a body is sent |
| `X-Correlation-ID` | Optional; echoed as `X-Request-ID` |

JWT claims: `sub` (`auth.users.id`), `tid` (OIDC tenant id, matched against
`tenants.oidc_tenant_id`), `jti` (Redis blacklist key) and `authorHash` (opaque
64-hex pseudonym copied verbatim from `auth.users.author_hash`). Agents also
send `type` (`AGENT_EXTRACTOR`, `AGENT_RELACIONADOR`, `AGENT_CONSOLIDADOR`,
`AGENT_EMBEDDER`); agent requests skip workspace membership but still need a
valid `X-Workspace-ID` and a provisioned `tid`.

ADR-0020 reserves `PUT /api/v1/nodes/{id}/embedding` for the Phase 2 embedder
(agent type `AGENT_EMBEDDER`, body `{ embedding: number[768], model }`). It is
implemented; see [Nodes](#3-nodes).

Local development without an IdP still uses the seeded identities and a
minted token:

```bash
pnpm --filter @vozlab/database db:seed:dev
TOKEN=$(pnpm --filter @vozlab/database db:mint-token -- --as maintainer \
  | grep -E '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')
WS=33333333-3333-4333-8333-333333333333
```

`db:seed:dev` assumes migrations have run. The dev token lasts 12 hours and
has no refresh cookie; it cannot be refreshed, but it can be blacklisted with
`/auth/logout`.

### Global errors

All protected routes may return `400 ERR_MISSING_WORKSPACE_HEADER` /
`ERR_INVALID_WORKSPACE_HEADER`, `401` (token), `403` (membership or role),
`422 ERR_VALIDATION_FAILED` (Zod), `429 ERR_RATE_LIMIT_EXCEEDED`, `500` or
`503`. Envelope: `{ "code": "ERR_...", "message": "..." }`; validation adds
`issues`.

### Pagination

Lists use keyset pagination and return the resource key plus `nextCursor` (not
a generic `items`):

| Resource | Shape |
| --- | --- |
| Nodes | `{ "nodes": NodeDto[], "nextCursor": string \| null }` |
| Edges | `{ "edges": EdgeDto[], "nextCursor": string \| null }` |
| Proposals | `{ "proposals": ProposalDto[], "nextCursor": string \| null }` |
| Threads | `{ "threads": ThreadDto[], "nextCursor": string \| null }` |
| Posts | `{ "posts": PostDto[], "nextCursor": string \| null }` |

`limit` is 1–100 (default 20); `cursor` is opaque; a malformed cursor is
`422 ERR_VALIDATION_FAILED`. Ordering is `createdAt DESC, id DESC` except
posts, which are chronological (`ASC`).

## 2. Health (public)

| Method | Path | Success | Failure |
| --- | --- | --- | --- |
| `GET` | `/health` | `200 { "status": "alive" }` | — |
| `GET` | `/health/live` | `200 { "status": "alive" }` | — |
| `GET` | `/health/ready` | `200 { "status": "ready", "checks": { "database": "up", "redis": "up" } }` | `503 { "status": "degraded", "checks": { ... } }` |

Readiness checks the router DB and Redis only, not tenant DBs. The degraded
body is not an `ERROR_CODES` envelope.

## 3. Nodes

`NodeDto`: `id`, `workspaceId`, `typeKey`, `title`, `description` (string or
null), `attributes`, `authorHash`, `status`, `communityScore`, `createdAt`,
`updatedAt`.

| Method | Path | Input | Success | Route errors |
| --- | --- | --- | --- | --- |
| `POST` | `/api/v1/nodes` | `typeKey` 1–100; `title` 3–255; `description?`; `attributes?` object | `201 { id, workspaceId, typeKey, title, description, status }`, `PENDING` | `422` unknown/inactive `typeKey` or schema |
| `GET` | `/api/v1/nodes` | `limit`, `cursor` | `200 { nodes, nextCursor }` | `422` cursor/query |
| `GET` | `/api/v1/nodes/window` | `limit` 1–200 (100) | `200 { nodes: NodeDto[], edges: SubgraphEdgeDto[] }` — the most recent nodes of the workspace and the relations **among them**; a relation whose other endpoint is outside the window is not returned |
| `GET` | `/api/v1/nodes/subgraph` | `rootId` UUID; `depth` 0–3 (1); `limit` 1–200 (100) | `200 { nodes: NodeDto[], edges: SubgraphEdgeDto[] }` — the edge carries the attributes, the author pseudonym and the creation instant | `404 ERR_NODE_NOT_FOUND` for a missing/foreign/deleted root |
| `GET` | `/api/v1/nodes/:id` | path UUID | `200 { "node": NodeDto }` | `404 ERR_NODE_NOT_FOUND` |
| `GET` | `/api/v1/nodes/:id/neighbors` | path UUID; `limit` 1–10 (5) | `200 { node, neighbors: [{ id, typeKey, title, description, status, similarity }] }` | `404 ERR_NODE_NOT_FOUND` missing/foreign/deleted; `409 ERR_NODE_NOT_EMBEDDED` no vector yet |
| `DELETE` | `/api/v1/nodes/:id` | path UUID | `204`, empty body | `403` non-author; `404` missing/foreign/deleted |
| `PUT` | `/api/v1/nodes/:id/embedding` | `embedding` 768 finite numbers; `model` string | `204`, empty body | `403 ERR_AUTHORIZATION_FAILED` (not `AGENT_EMBEDDER`); `404 ERR_NODE_NOT_FOUND` missing/foreign/deleted; `422 ERR_VALIDATION_FAILED` bad vector or unknown model |

Notes:

- The node list returns every non-deleted node, regardless of status.
- Creation requires an **ACTIVE** ontology class (`typeKey`); nodes are born
  `PENDING`.
- The subgraph's edge is **enriched**: the topology, the relation key, the
  relation's display names, the status, the community score, the
  **attributes** (the same JSONB `GET /api/v1/edges/:id` returns), the
  **author pseudonym** and the **creation instant**. It has no `updatedAt`:
  the `public.edges` table has no such column. The payload grows a
  constant **135 B per relation**. The score is there so the canvas can
  vote on a relation without a second read, and the content is there so a
  relation can be **expanded** in the picture without a second read either.
- The subgraph's traversal is **ranked**: "the nearest" is the **strongest
  relation first** and, among equals, the **most recent**
  (`community_score DESC, created_at DESC`). Before the ranking the
  traversal truncated by whatever the index scan produced, so "the nearest"
  was an accident. See [ADR-0027](decisions/ADR-0027-ranked-traversal-and-age-trigger.md).
- `subgraph` is registered **before** `/nodes/:id`; traversal is undirected,
  workspace-scoped, `depth <= 3`, `limit <= 200`, and uses the bounded
  recursive SQL CTE (not Apache AGE).
- Delete is soft (author only) and does not delete edges.
- `PUT /nodes/:id/embedding` is the **agent-only** embedding write-back
  (FR-18, [ADR-0020](decisions/ADR-0020-dedicated-embedding-pipeline.md)).
  Only a token whose `type` claim is `AGENT_EMBEDDER` may call it; the vector
  must have exactly 768 finite dimensions and `model` must equal the
  deployment's `EMBEDDING_MODEL` (`nomic-embed-text` by default). The write is
  an idempotent overwrite that also stamps `embedding_model` and
  `embedded_at`; it never changes the node status and does not create a
  proposal.
- `GET /nodes/:id/neighbors` is the **vector search** read path
  (FR-19, [ADR-0022](decisions/ADR-0022-relator-neighbour-lookup.md)). It is
  a normal protected read: any member of the workspace may call it. The
  search is workspace-scoped and excludes soft-deleted rows, rows without a
  vector and rows whose status is not `ACTIVE`/`PENDING`. `similarity` is
  `1 - cosine_distance`. A node without a vector answers
  `409 ERR_NODE_NOT_EMBEDDED` — the retryable state the Relator waits for.

## 4. Edges

`EdgeDto`: `id`, `workspaceId`, `sourceNodeId`, `targetNodeId`,
`relationKey`, `attributes`, `authorHash`, `status`, `communityScore`,
`createdAt`.

| Method | Path | Input | Success | Route errors |
| --- | --- | --- | --- | --- |
| `POST` | `/api/v1/edges` | `sourceNodeId` UUID; `targetNodeId` UUID; `relationKey` 1–100; `attributes?` object | `201 { id, sourceNodeId, targetNodeId, relationKey, status, communityScore }`, `PENDING` | `404 ERR_NODE_NOT_FOUND` endpoint missing/foreign; `422 ERR_INVALID_RELATION_DOMAIN_RANGE` |
| `GET` | `/api/v1/edges` | `limit`, `cursor` | `200 { edges, nextCursor }` | `422` cursor/query |
| `GET` | `/api/v1/edges/:id` | path UUID | `200 { "edge": EdgeDto }` | `404 ERR_EDGE_NOT_FOUND` |
| `PATCH` | `/api/v1/edges/:id` | optional `relationKey`, optional `attributes` | `200 { "edge": EdgeDto }` | `403` non-author; `404 ERR_EDGE_NOT_FOUND` |
| `DELETE` | `/api/v1/edges/:id` | path UUID | `204` | `403` non-author; `404 ERR_EDGE_NOT_FOUND` |

If an object property with `relationKey` exists, its domain/range rules are
enforced; endpoint node status is not checked. The list returns all
non-deleted edges, regardless of status.


### The display names

`NodeDto.typeDisplayNames`, `SubgraphEdgeDto.relationDisplayNames` and
`EdgeDto.relationDisplayNames` carry the **whole map** of the ontology's
`display_names` — `{"en": "Problem", "es": "Problema"}` — and the client
picks its language. The API does **not** negotiate one: a workspace may have
ten languages and the client may be in any of them.

A map is empty (`{}`) when the class or the relation is not in the
workspace's ontology — a `PROPOSED` class, or a key with no row — and the
client falls back to the key. A class of **another workspace** is never in
the answer.

## 5. Proposals

`ProposalDto`: `id`, `workspaceId`, `targetId`, `targetType`, `kind`, `status`,
`communityScore`, `justification`, `proposerHash`, `resolvedBy`,
`resolvedAt`, `proposedChanges`, `createdAt` (`resolvedBy`/`resolvedAt` may be
null).

| Method | Path | Input | Success | Route errors |
| --- | --- | --- | --- | --- |
| `POST` | `/api/v1/proposals` | `kind?` (`EDIT`\|`MERGE`, default `EDIT`); `targetId` UUID; `targetType` `NODE\|EDGE\|ONTOLOGY`; `proposedChanges` object; `justification?` | `201 { id, targetId, targetType, kind, status, communityScore }`, `PENDING` | NODE/EDGE missing/foreign → `404`; ONTOLOGY missing/foreign → `422 ERR_VALIDATION_FAILED`; merge → `409 ERR_DUPLICATE_PROPOSAL`, `422 ERR_INVALID_STATE_TRANSITION` |
| `GET` | `/api/v1/proposals` | `status?`, `targetType?`, `kind?`, `limit`, `cursor` | `200 { proposals, nextCursor }` | `422` query/cursor |
| `GET` | `/api/v1/proposals/:id` | path UUID | `200 { "proposal": ProposalDto }` | `404 ERR_PROPOSAL_NOT_FOUND` |
| `PUT` | `/api/v1/proposals/:id/approve` | no body | `200 { id, status: "APPROVED_BY_AUTHOR" }` | `403` not maintainer; `404`; `422 ERR_INVALID_STATE_TRANSITION`; target gone → `404`/`422` |
| `PUT` | `/api/v1/proposals/:id/reject` | no body | `200 { id, status: "REJECTED_BY_AUTHOR" }` | `403` not maintainer; `404`; `422` invalid state |
| `PUT` | `/api/v1/proposals/:id/auto-apply` | no body | `200 { id, status: "AUTO_APPLIED" }` | `403` not MODERATOR/ADMIN; `404`; `422 ERR_UNMET_AUTO_APPLY_CRITERIA` or invalid state |

Notes:

- `status` filter values: `PENDING`, `APPROVED_BY_AUTHOR`,
  `REJECTED_BY_AUTHOR`, `AUTO_APPLIED`.
- `kind` values: `EDIT` (an attribute delta applied to the target) and `MERGE`
  ([ADR-0026](decisions/ADR-0026-merge-contract.md)). A request without `kind`
  is an `EDIT` proposal.
- A `MERGE` proposal targets the node that is merged **away** and names the
  surviving node in `proposedChanges.mergeIntoNodeId`; `targetType` must be
  `NODE`. It is rejected with `404 ERR_NODE_NOT_FOUND` when either node is
  missing or belongs to another workspace, with `422
  ERR_INVALID_STATE_TRANSITION` when the duplicate is not mergeable (`PENDING`
  or `ACTIVE`) or the survivor was merged away, and with `409
  ERR_DUPLICATE_PROPOSAL` when a merge proposal for that node is already
  pending.
- Only the target maintainer may approve/reject. Auto-apply requires a
  workspace `MODERATOR`/`ADMIN` role (resolved server-side), age ≥ 14 days and
  `communityScore >= 10`.
- Approval/auto-apply applies the target delta and changes the proposal status
  atomically; rejection only changes the status.
- Approving a `MERGE` proposal merges the duplicate into the survivor: the
  duplicate becomes `MERGED` and records `merged_into_id`, the survivor adopts
  the attributes it does not have (its own values win) and the support of the
  duplicate, and the duplicate's edges are re-pointed to the survivor. The API
  publishes `NODE_MERGED` after the transaction commits. The state rules are
  checked again when the merge is applied: a merge whose duplicate or
  survivor is no longer mergeable is refused with `422
  ERR_INVALID_STATE_TRANSITION` (this is what keeps two nodes that each
  proposed to absorb the other from leaving the graph without a survivor).
- `targetId` is polymorphic with no FK (decision M-12); existence is validated
  at creation and re-checked when resolving.

## 6. Ontology

| Method | Path | Input | Success | Route errors |
| --- | --- | --- | --- | --- |
| `POST` | `/api/v1/ontology/classes` | `systemKey` 1–100; `displayNames` locale→string; `descriptions?`; `parentClassKey?` | `201 { id, systemKey, status: "PROPOSED" }` | `422` duplicate key or schema |
| `POST` | `/api/v1/ontology/datatype-properties` | `systemKey`; `displayNames`; `descriptions?`; `datatype` (`string\|number\|boolean\|date\|enum`, default `string`); `allowedValues?`; `isRequired?`; `defaultValue?`; `domainClassKey` | `201 { id, systemKey, status: "PROPOSED" }` | `422` unknown `domainClassKey` |
| `POST` | `/api/v1/ontology/object-properties` | `systemKey`; `displayNames`; `descriptions?`; `domainClassKey`; `rangeClassKey`; `isDirectional?`; `isSymmetric?`; `allowsSelfRelation?` | `201 { id, systemKey, status: "PROPOSED" }` | `422` unknown domain/range key |
| `PUT` | `/api/v1/ontology/classes/:id/activate` | no body | `200 { id, systemKey, status: "ACTIVE" }` | `403` not MODERATOR/ADMIN; `422` class missing/foreign or not `PROPOSED` |
| `GET` | `/api/v1/ontology` | — | `200 { classes: OntologyClassDto[], objectProperties: ObjectPropertyDto[], datatypeProperties: DatatypePropertyDto[] }` | — |

`OntologyClassDto`: `id`, `workspaceId`, `systemKey`, `displayNames`,
`descriptions`, `parentClassKey`, `status`, `proposedBy`, `createdAt`.
`ObjectPropertyDto` adds `domainClassKey`, `rangeClassKey`, `isDirectional`,
`isSymmetric`, `allowsSelfRelation`.

- `ontology_classes` is UNIQUE(`workspace_id`, `system_key`); duplicate
  `systemKey` is `422`.
- `GET /ontology` returns only `ACTIVE` classes and object properties, plus
  the `ACTIVE` datatype properties. A property still awaiting approval never
  reaches the consumer. `datatypeProperties` is what drives the dynamic
  node-creation form (FR-06); it carries `datatype`, `allowedValues`,
  `isRequired` and `defaultValue` per property.
- **Only classes have an activation route.** A datatype or object property
  created through the API stays `PROPOSED` forever — `POST
  /ontology/datatype-properties` and `POST /ontology/object-properties` hard-code
  `PROPOSED` and nothing promotes them. A workspace can therefore only grow
  its metamodel through the API for *classes*; the properties that exist are
  the ones an operator inserted directly. The PWA's dynamic form is built
  from what is `ACTIVE`.
- Activating a missing/foreign class returns **422**, not 404.

## 7. Discussions

`ThreadDto`: `id`, `workspaceId`, `targetId`, `targetType`, `title`,
`status`, `createdByHash`, `createdAt`, `updatedAt`.
`PostDto`: `id`, `threadId`, `parentPostId`, `authorHash`, `body`, `upvotes`,
`downvotes`, `communityScore`, `createdAt`.

| Method | Path | Input | Success | Route errors |
| --- | --- | --- | --- | --- |
| `POST` | `/api/v1/discussions` | `targetId` UUID; `targetType` `NODE\|EDGE\|PROPOSAL\|ONTOLOGY`; `title` 3–255 | `201 { id, targetId, targetType, title, status: "OPEN" }` | `422` schema |
| `GET` | `/api/v1/discussions` | `targetId` (required), `targetType` (required), `limit`, `cursor` | `200 { threads, nextCursor }` | `422` query/cursor |
| `POST` | `/api/v1/discussions/:threadId/posts` | `body` 1–5000; `parentPostId?` UUID | `201 { id, threadId, parentPostId, communityScore }` | `404 ERR_THREAD_NOT_FOUND` |
| `GET` | `/api/v1/discussions/:threadId/posts` | `limit`, `cursor` | `200 { posts, nextCursor }` | `404 ERR_THREAD_NOT_FOUND` |
| `PUT` | `/api/v1/discussions/:threadId/close` | no body | `200 { "thread": ThreadDto }` | `403` non-creator; `404`; `422` already closed |
| `DELETE` | `/api/v1/discussions/posts/:id` | path UUID | `204` | `403` non-author; `404 ERR_POST_NOT_FOUND` |

- Threads are listed in `createdAt DESC, id DESC` order; posts are
  chronological and exclude soft-deleted rows.
- A closed thread can still receive posts today.
- The thread target is stored polymorphically; `CreateThreadUseCase` does not
  verify target existence.
- Deleting a post is soft (author only) and idempotent from the client view.

## 8. Interactions

| Method | Path | Input | Success | Route errors |
| --- | --- | --- | --- | --- |
| `POST` | `/api/v1/interactions` | `targetId` UUID; `targetType` `NODE\|EDGE\|PROPOSAL\|POST`; `interactionType` `UPVOTE\|DOWNVOTE\|SUPPORT\|VALIDATE` | `201 { id, targetId, targetType, interactionType, value }` | `409 ERR_DUPLICATE_INTERACTION`; target `404`; `422` |

- `value` is server-derived: `-1` for `DOWNVOTE`, `+1` otherwise. Clients must
  not send it.
- Repeating the **same** interaction type is idempotent and returns `201` with
  the existing row. A **different** type for the same user/target is `409`.
- Missing/foreign/soft-deleted targets return the type-specific 404:
  `ERR_NODE_NOT_FOUND`, `ERR_EDGE_NOT_FOUND`, `ERR_PROPOSAL_NOT_FOUND` or
  `ERR_POST_NOT_FOUND`.
- The insert and the target counter update share one transaction. There is no
  read, retract or change-vote endpoint.

## 9. Ingestion

| Method | Path | Input | Success | Route errors |
| --- | --- | --- | --- | --- |
| `GET` | `/api/v1/ingestion/resolve-source` | `sourceId` query (1–200) | `200 { sourceId, workspaceId, connectorType, behaviorProfile, displayName }` | `404 ERR_DATA_SOURCE_NOT_FOUND` unknown/inactive source; `422` missing `sourceId` |

The route is **agent-only** and **tenant-scoped**, and it is the one protected
route that does **not** take an `X-Workspace-ID` header: the workspace is the
answer, not an input ([ADR-0025](decisions/ADR-0025-source-resolution-route.md)).
The lookup runs inside the tenant resolved from the `tid` claim, so a source
of another tenant is never visible. A human token gets
`403 ERR_AUTHORIZATION_FAILED`.

The registry (`meta.data_sources`) has **no management route yet**: the rows
are inserted by an operator. The dev seed provisions one example source
(`dev-minutes-2026`).

## 10. Examples

Create a node as the seeded maintainer:

```bash
curl -s -X POST http://localhost:3000/api/v1/nodes \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-ID: $WS" \
  -H 'Content-Type: application/json' \
  -d '{"typeKey":"Problem","title":"Wi-Fi drops in Building 3","attributes":{"building":"B3"}}'
```

List the workspace's newest nodes:

```bash
curl -s "http://localhost:3000/api/v1/nodes?limit=20" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-ID: $WS"
```

## 11. Not implemented

No route exists today for: batched node ingestion (`BatchCreateNodeSchema` is a
contract only — [ADR-0024](decisions/ADR-0024-no-batch-node-endpoint.md) keeps
the write path one node per request); management of the source registry; SSE;
metrics; Apache AGE/Cypher; a merge proposal (the Relator can judge a merge
but has nothing to submit); node or edge status transitions;
datatype/object-property activation; interaction reads or vote retraction.
The PWA has been built through roadmap 3.1–3.7: the OIDC login, the event
join, the graph canvas, the governance UI and the offline shell all exist.
Two things are still missing from it: the event QR **scanner** (the join page
takes the code as text) and a way to **read** the ontology's proposed
properties — only the active ones are published, and only classes can be
activated through the API. The Extractor and Consolidator apps are still
empty scaffolds; the embedder and the Relator exist but are not in Compose or
CI.

Related: [Domain model](domain-model.md) · [Conventions](conventions.md) ·
[Errors](errors.md).
