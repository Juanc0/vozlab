# Architecture Decision Records (ADRs)

This directory is the **canonical decision record** for VozLab. An ADR states a decision, the context that forced it, and the consequences accepted with it. It is not a tutorial and not a component specification.

- `Accepted` — the decision is implemented or is the binding contract for new work.
- `Deferred` — the decision is to postpone the work; the ADR states the interim behavior.
- `Rejected` — the option was considered and will not be used without a new ADR.
- `Superseded` — a later ADR replaced the decision; the old ADR stays as history.

When an old document (under `docs/modules`, `docs/system` or `docs/devops`) conflicts with an ADR, the ADR wins. Those documents are archived as history. Specifications for components that are not built yet live under `docs/spec/`; the ADR log records decisions, not designs.

## Index

| # | Title | Status | Decision in one line |
| --- | --- | --- | --- |
| [0001](ADR-0001-bearer-jwt-auth-transport.md) | Bearer JWT as the authentication transport | Accepted | Authenticate graph requests with `Authorization: Bearer <jwt>`; the refresh credential is a separate `HttpOnly` cookie (0018). |
| [0002](ADR-0002-two-physical-databases.md) | Two physical PostgreSQL databases with `tid` routing | Accepted | A global router DB plus one physical DB per tenant; every repository is scoped by `tid`. `event_codes` is the documented router exception (0019). |
| [0003](ADR-0003-drizzle-schema-source-of-truth.md) | Drizzle schema is the single source of truth for migrations | Accepted | Migrations are generated from the Drizzle schema, never hand-edited; local configs force `ssl: false`. |
| [0004](ADR-0004-bounded-sql-cte-age-deferred.md) | Bounded recursive SQL CTE for subgraphs; Apache AGE deferred | Accepted | The read path is a bounded CTE (`depth <= 3`, `limit <= 200`); AGE needs its own mirroring milestone. |
| [0005](ADR-0005-synchronous-vote-scoring.md) | Vote scoring is a synchronous atomic DB increment | Accepted | Counters update in the same transaction as the vote; the Redis-buffered CQRS design is deferred. |
| [0006](ADR-0006-soft-delete-policy.md) | Per-entity soft-delete policy | Accepted | `deleted_at` for nodes/edges/posts, status for threads/proposals/ontology, interactions immutable; adapter writes `deleted_at`. |
| [0007](ADR-0007-per-actor-rate-limiting.md) | Per-actor rate limiting with a per-workspace ceiling | Accepted | Limit each `authorHash`/IP, plus a coarse workspace cap (`x10` by default). |
| [0008](ADR-0008-cross-workspace-404.md) | Cross-workspace access returns 404, never 403 | Accepted | A foreign-workspace object reads as missing so its existence is not leaked. |
| [0009](ADR-0009-api-owned-source-registry.md) | The API owns the data-source to workspace registry | Accepted | Workers never choose a workspace; the API resolves `source_id` via `meta.data_sources` (Phase 2). |
| [0010](ADR-0010-port-naming-vocabulary.md) | Port naming vocabulary | Accepted | One grammar for repository ports (`find*`/`list*`/`save`/`update`/`softDelete`/`apply*Delta`). |
| [0011](ADR-0011-timestamp-ownership.md) | Timestamp ownership | Accepted | Domain owns `created_at`/`updated_at`; adapter owns `deleted_at` and persists the entity's `updatedAt`. |
| [0012](ADR-0012-env-file-loading.md) | `.env` loading via `tsx --env-file-if-exists` | Accepted | Dev and DB scripts load the repo-root `.env`; production uses the orchestrator environment. |
| [0013](ADR-0013-random-opaque-pseudonym.md) | Pseudonymity uses a random opaque per-user pseudonym, not a salt | Accepted | `author_hash` is a random 64-hex value carried verbatim in the token; no salt. |
| [0014](ADR-0014-real-auth-endpoints-deferred.md) | Real auth endpoints deferred; dev JWT minting is the interim | Superseded by 0018 | OIDC login/callback/logout, event-QR join and `event_codes` were future work at the time. |
| [0015](ADR-0015-sse-deferred.md) | SSE notifications deferred; REST polling is the interim | Deferred | No push channel yet; clients read or poll the REST API. |
| [0016](ADR-0016-graphql-rejected.md) | GraphQL rejected; REST + Zod + `X-Workspace-ID` is the contract | Rejected | REST is the contract; a read-only facade may be added later without redesign. |
| [0017](ADR-0017-thin-ci.md) | Thin CI now; full Phase 4 pipeline planned | Accepted | CI runs install + build/type-check/test; lint is red and excluded; integration/E2E/load/coverage are planned. |
| [0018](ADR-0018-oidc-jit-hybrid-sessions.md) | OIDC login, JIT accounts and hybrid access/refresh sessions | Accepted | PKCE + JWKS validation, JIT users with no implicit membership, 15 min JSON JWT + rotating `HttpOnly` refresh cookie. |
| [0019](ADR-0019-global-event-codes.md) | Global event-code registry in the router database | Accepted | `router.event_codes` is the documented exception to ADR-0002; QR contains only the code and consumption is atomic. |
| [0020](ADR-0020-dedicated-embedding-pipeline.md) | Dedicated embedding pipeline with agent-only write-back | Accepted | A separate embedder consumes `NODE_CREATED` and writes 768-dimensional vectors through `PUT /api/v1/nodes/:id/embedding`; the Relator retries until a vector exists. |
| [0021](ADR-0021-python-worker-runtime.md) | Python 3.12 workers with a shared uv runtime and Redis Streams | Accepted | Workers share `vozlab_worker` (config, JSON logs, agent tokens, httpx client, consumer groups, `XAUTOCLAIM`, bounded retries and DLQ); Python 3.12 + uv + pytest. |
| [0022](ADR-0022-relator-neighbour-lookup.md) | The Relator reads neighbours through the API, not the database | Accepted | `GET /api/v1/nodes/:id/neighbors` runs the workspace-scoped pgvector search; `409 ERR_NODE_NOT_EMBEDDED` is the retryable "vector not ready" state. |
| [0023](ADR-0023-relator-edge-and-merge-semantics.md) | The Relator proposes edges; merges wait for a merge contract | Accepted (amended by 0026) | `EDGE` creates a `PENDING` edge via `POST /api/v1/edges` with an ontology relation key; `MERGE` was logged only — the merge contract arrived with 0026. |
| [0024](ADR-0024-no-batch-node-endpoint.md) | Node ingestion stays one node per request | Accepted | No `POST /nodes/batch`: the rate limiter counts requests, so a bulk route would bypass the write budget; `BatchCreateNodeSchema` stays a contract. |
| [0025](ADR-0025-source-resolution-route.md) | Source resolution is an agent-only, tenant-scoped API route | Accepted | `GET /api/v1/ingestion/resolve-source` maps a `sourceId` to its workspace; agent-only, tenant-scoped, no `X-Workspace-ID`. |
| [0026](ADR-0026-merge-contract.md) | A merge is a proposal kind, applied by the API | Accepted | `CreateProposalSchema` becomes a union on `kind` (`EDIT` \| `MERGE`); a merge proposal names the duplicate as its target and the survivor as `mergeIntoNodeId`, and the API applies the merge atomically with the approval. |
| [0027](ADR-0027-ranked-traversal-and-age-trigger.md) | The graph's read path: the ranked bounded CTE, the indexes, and the trigger that would reopen Apache AGE | Accepted | Extends ADR-0004: ranked bounded CTE with measurable trigger for reopening AGE. |
| [0028](ADR-0028-multi-institution-identity-global-index-and-broker.md) | Multi-institution identity, global index and external broker | Accepted | Keycloak as external broker (OIDC + SAML 2.0 + LDAP); router stores `(issuer, subject)` global index (M2a + M2b); invitations and direct add; append-only audit; SAML 2.0 only. |

## How to add an ADR

1. Take the next free number (`ADR-000N`) and a short kebab-case title; never renumber or reuse a number.
2. Copy the structure: title, `Status`, `Date` (`YYYY-MM-DD`), optional `Supersedes`/`Superseded by`, then `Context`, `Decision`, `Consequences` (`Positive`, `Negative / costs`) and `Links`.
3. In `Context`, record the forces and the alternatives that were actually considered. In `Decision`, use imperative statements. In `Consequences`, include what becomes harder, not only what becomes easier.
4. Link to the code, migration, task or review that proves the decision. If a claim cannot be verified in the repository, phrase it as the recorded decision rather than as runtime behavior.
5. Add the row to the index above.
6. Do not rewrite an accepted ADR. If the decision changes, write a new ADR with `Supersedes: ADR-000N` and add `Superseded by: ADR-000M` to the old one.
