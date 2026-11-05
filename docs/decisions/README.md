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
| [0027](ADR-0027-ranked-traversal-and-age-trigger.md) | ADR-0027 — The graph's read path: the ranked bounded CTE, the indexes, and the trigger that would reopen Apache AGE | Accepted | ### 1. The ranking rule |
| [0028](ADR-0028-multi-institution-identity-global-index-and-broker.md) | ADR-0028: Multi-institution identity, global index and external broker | Accepted | ### 1. Broker is external to the API |
| [0029](ADR-0029-explicit-provider-selection-and-general-tenant.md) | ADR-0029: Explicit provider selection at the OIDC broker and the "General" tenant | Accepted | Adopt Option B , with two rules: |
| [0030](ADR-0030-zitadel-replaces-keycloak.md) | ADR-0030: Zitadel replaces Keycloak as the identity broker | Accepted | 1. Zitadel is the production broker. It runs under docker compose --profile idp on |
| [0031](ADR-0031-tenant-resolved-from-token-claims.md) | ADR-0031: Tenant is resolved from token claims, not from user input | Accepted | 1. The login flow carries only kc idp hint , never an institution slug. |
| [0032](ADR-0032-self-hosted-observability.md) | ADR-0032: Self-hosted observability (Prometheus, Tempo, Grafana) | Accepted | 1. Metrics. The API exposes GET /metrics (Prometheus text format) via |
| [0033](ADR-0033-demo-topology-single-host.md) | ADR-0033: Demo topology is a single host with a tunnel; no cloud for the MVP | Accepted | 1. The MVP/demo runs on a single host with the existing docker compose |
| [0034](ADR-0034-keep-redis-streams.md) | ADR-0034: Keep Redis Streams as the worker queue; add trimming and an outbox instead of migrating to SQS | Accepted | 1. Redis Streams remain the transport. No migration to SQS, Kafka or any |
| [0035](ADR-0035-ingestion-gateway.md) | ADR-0035: Ingestion is a registry-backed gateway with PII masked before enqueue | Accepted | 1. A management API for meta.data sources (maintainer/admin only) registers |
| [0036](ADR-0036-workers-always-on-containers.md) | ADR-0036: Workers are always-on containers; Lambda is used only for stateless glue | Accepted | 1. Embedder, relator and extractor run as always-on containers (ECS Fargate |
| [0037](ADR-0037-ollama-colocated.md) | ADR-0037: Ollama stays colocated with the workers; a dedicated GPU node in production | Accepted | 1. In the demo, Ollama runs on the same host as the workers (compose |
| [0038](ADR-0038-ingestion-gateway-deferred.md) | ADR-0038: Ingestion stays in the API for the MVP; extraction to a dedicated gateway is deferred | Accepted | 1. Ingestion stays in the API for the MVP. The IngestSourceUseCase is a |
| [0039](ADR-0039-deploy-strategy-mvp.md) | ADR-0039: Deploy strategy for the MVP — single host, published images, Cloudflare Tunnel | Accepted | 1. Images are built locally ( docker build -f apps/ /Dockerfile ) and tagged |
| [0040](ADR-0040-zrok-three-shares-demo.md) | ADR-0040: Demo exposure uses three independent zrok shares (no reverse proxy) | Accepted | 1. The demo is exposed through three reserved zrok shares , one per service: |
| [0041](ADR-0041-tenant-and-workspace-administration.md) | ADR-0041 — Tenant and workspace administration (US-00) | Accepted | 1. Two administrators, two scopes. A tenant ADMIN |
| [0042](ADR-0042-cross-tenant-identity-and-explicit-tenant.md) | ADR-0042 — Cross-tenant identity and explicit tenant selection | Accepted | 1. Router DB becomes the identity authority : enrich global identities (rename/extend to global users ) with full identity profile (email, email verified, full |
| [0043](ADR-0043-production-topology-caddy-t2.md) | ADR-0043: Production topology is T2 — Caddy on a single host, three origins | Accepted | Adopt T2: Caddy terminates TLS on the deployment host and exposes three |
| [0044](ADR-0044-identity-vocabulary-coherence-and-migration-baseline.md) | ADR-0044: Identity vocabulary coherence and migration baseline collapse | Accepted | 1. One vocabulary, applied everywhere — schema, TS internals, script |
| [0045](ADR-0045-credential-consolidation-and-peppered-email.md) | ADR-0045: Credential consolidation and peppered email hashes | Accepted | 1. No cleartext email in any table of the platform. |
| [0046](ADR-0046-thin-credential-routing-for-events.md) | ADR-0046: Thin credential routing for event codes | Accepted | 1. Router = directory only. public.credential routes(credential hash |
| [0047](ADR-0047-dependency-upgrade-wave.md) | ADR-0047: Dependency upgrade wave (Fastify 5, node-redis 6, Valkey, Zod 4, jose) | Accepted | 1. Fastify 4 → 5 (with @fastify/cookie 11 and @fastify/cors 10). The |
| [0048](ADR-0048-split-tenant-and-workspace-administration.md) | ADR-0048: Tenant administration and workspace administration are two surfaces | Accepted | ### 1. Two surfaces, one authority each |
| [0049](ADR-0049-no-tenant-bypass-over-workspace-administration.md) | ADR-0049 — No tenant bypass over workspace administration | Accepted | ### 1. No bypass in the guard |
| [0050](ADR-0050-tenant-user-management-and-role-carveout.md) | ADR-0050 — Tenant user management and the role carve-out | Accepted | ### 1. The carve-out |
| [0051](ADR-0051-node-edge-governance-activation.md) | ADR-0051 — Node and edge governance activation (settling D-03) | Accepted | ### 1. Visibility of PENDING and REJECTED content |
| [0052](ADR-0052-dev-environment-bootstrap.md) | ADR-0052: Dev environment bootstrap (base stack + Zitadel) | Accepted | 1. One bootstrap script : scripts/dev-up.sh {demo} brings up the base |

## How to add an ADR

1. Take the next free number (`ADR-000N`) and a short kebab-case title; never renumber or reuse a number.
2. Copy the structure: title, `Status`, `Date` (`YYYY-MM-DD`), optional `Supersedes`/`Superseded by`, then `Context`, `Decision`, `Consequences` (`Positive`, `Negative / costs`) and `Links`.
3. In `Context`, record the forces and the alternatives that were actually considered. In `Decision`, use imperative statements. In `Consequences`, include what becomes harder, not only what becomes easier.
4. Link to the code, migration, task or review that proves the decision. If a claim cannot be verified in the repository, phrase it as the recorded decision rather than as runtime behavior.
5. Add the row to the index above.
6. Do not rewrite an accepted ADR. If the decision changes, write a new ADR with `Supersedes: ADR-000N` and add `Superseded by: ADR-000M` to the old one.

## Recorded contradictions, and how they were settled

The administration and identity records contradict each other in seven places.
None of them was edited away: an accepted ADR is history. The list records
which record governs the code today, so the next reader does not have to
re-derive it.

| # | The contradiction | What governs |
| --- | --- | --- |
| 1 | ADR-0046:106 says only the CLI mints `EVENT` credentials; ADR-0048:140-146 lets a workspace admin create them through the join-code routes. | ADR-0048, the later record. ADR-0046 §minting is history. |
| 2 | ADR-0049:163 says neither surface changes `system_role`; ADR-0050:174 moves that power to the tenant surface. | ADR-0050. ADR-0049's matrix row is stale. |
| 3 | ADR-0049:130 calls the tenant user directory read-only; ADR-0050:108-115 gives it promote, demote, suspend and activate. | ADR-0050, implemented at `/admin`. |
| 4 | ADR-0041:65 throws `ERR_INVITATION_INVALID` on a stale invitation; ADR-0045:193 supersedes that with "the login continues". | ADR-0045. §8 of ADR-0041 was never amended in its own text. |
| 5 | A plan wanted a separate "Create workspace" tab; another wanted a modal from the table title. | The modal: `admin-data-tables/v1.md:30`, which is what the code does. |
| 6 | `navbar-gating/v1.md` never mentions a `/workspace-admin` entry, while ADR-0048:188 and `admin-surfaces/v1.md:79-81` require two entries with independent gating. | The ADR. The plan was incomplete, and the entries are restored with structural gating. |
| 7 | ADR-0042 mandated `global_invitations` and `global_identities`; ADR-0045 deleted the first and renamed the second. | ADR-0045. ADR-0042 is now marked partially superseded, in its own header. |
