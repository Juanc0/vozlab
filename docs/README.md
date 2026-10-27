# VozLab documentation

This is the entry point for the current documentation set. It replaces the v1
specification tree, now frozen under `docs/archive/spec-v1/`. If a statement
here conflicts with code, **the code is authoritative** — please fix the
document.

Status snapshot: **2026-10-22**. Phases 0, 1, 1R, 1S, 1T and Batch 1V (auth flow) are complete; the API core is implemented and independently verified. Phase 2 is in progress: the shared Python worker runtime exists, the embedder (FR-18) and the Relator (FR-19) work end to end, and the Extractor (FR-17, partial — the ingestion producer is missing) is implemented. Phase 3 is complete: `apps/web` is a working SvelteKit 5 + Tailwind 4 PWA that builds, serves SSR and ships a manifest and a service worker (3.1), with the runes state, the per-tab workspace and the HTTP client in place (3.2), the route groups with the session guard and the workspace selector in place (3.3) the Cytoscape canvas with its bounded subgraph (3.4) and the governance UI — the creation forms, the proposal review, the discussions and the optimistic voting (3.5) — the offline shell, the install and update prompts and the accessibility pass (3.6), the Playwright suite (3.7), the Spanish demo graph and the development sign-in (3.8–3.9), the interface in Spanish and English (3.10), the exploration view (3.12), the inspector (3.13) and the mobile-first layout (3.14) in place. The **design round** followed it: the design system on the accent ladder (3.15), the node as a card with its title inside (3.16), the comparison of the two graph engines (3.17), the names in the interface's own language (3.18), the relation that expands like a node (3.19), the ranked traversal and its two indexes (3.20), walking the graph by clicking a node (3.21) and the graph page as a workspace (3.23). The **comparison of the engines** (3.17) was reduced to the two painters of the living spring — the two layered arrangements left the playground in 3.36. The Consolidator handler and operational hardening (Phase 4) are not started. `pnpm test` = 35 API files / 195 unit tests plus 64 web files / 552 tests, plus an opt-in Playwright suite (the engines journey was removed with the route); the opt-in integration suite adds 5 files / 29 tests against local Postgres/Redis; the Python runtime adds 105 tests (`uv run pytest`, now a CI job); `pnpm turbo run build type-check` is green; `pnpm lint` is **red** with 24 pre-existing `@typescript-eslint/no-explicit-any` errors.

## Live documents

| Document | Contents |
| --- | --- |
| [../README.md](../README.md) | Project overview, status, quickstart, commands |
| [architecture.md](architecture.md) | Context/container view, request path, two-DB topology, runtime facts |
| [requirements.md](requirements.md) | Normative FR-01…FR-20 and NFR-01…NFR-11 text and acceptance criteria |
| [domain-model.md](domain-model.md) | Entities, schemas, state machines, soft-delete and vote rules |
| [auth-and-tenancy.md](auth-and-tenancy.md) | OIDC flow, access/refresh sessions, guards, workspace isolation, pseudonymity |
| [auth-flow-oidc.md](auth-flow-oidc.md) | Visual walkthrough of the OIDC login flow (Mermaid sequence + component diagram): who talks to whom, when, and what is sent |
| [identity-broker-comparison.md](identity-broker-comparison.md) | Deep comparison of identity brokers (Keycloak, Authentik, Zitadel, Dex, Ory, Kanidm, Logto, FusionAuth, SaaS): protocols, weight, maturity, security, cost, multi-tenancy |
| [authentik-vs-zitadel.md](authentik-vs-zitadel.md) | Deep comparison Authentik vs Zitadel for VozLab: architecture, protocols, licensing (MIT vs BSL), LDAP, multi-tenancy, deployment, security, cost |
| [conventions.md](conventions.md) | Layering, NodeNext imports, naming, errors, events, pagination |
| [design-system.md](design-system.md) | The design system: the tokens, the type, the house rules a new surface follows |
| [graph-engine-research.md](graph-engine-research.md) | The graph engine: the research of 2026-10-21, the shortlist and the order of work |
| [api-reference.md](api-reference.md) | Endpoint catalogue, headers, payloads, status codes |
| [errors.md](errors.md) | Canonical `ERR_*` catalogue and HTTP mapping |
| [runbook-dev.md](runbook-dev.md) | Local bootstrap, migrations, seed, tokens, troubleshooting |
| [runbook-ops.md](runbook-ops.md) | Runtime topology, health checks, shutdown, deployment gaps |
| [runbook-demo-zrok.md](runbook-demo-zrok.md) | Local demo exposed through two reserved zrok shares (web/API + Zitadel auth) |
| [testing.md](testing.md) | Test layering, current coverage, CI, known gaps |
| [agent-tooling.md](agent-tooling.md) | Skills, subagents, slash commands and MCP servers used to work on VozLab |
| [spec/](spec/) | Phase 2/3 component specs — the workers are built, the **PWA is partially built** (3.1), CI/CD is partial |
| [decisions/](decisions/) | Architecture Decision Records (`ADR-*.md`) |
| [../ROADMAP.md](../ROADMAP.md) | Open work, deferred items, known debt |
| [archive/](archive/) | **Frozen history** — v1 spec, task prompts, reviews, old plan/TODO. Not maintained. |

## Requirements status

Status reflects the code on 2026-10-19. Normative text lives in [requirements.md](requirements.md); “Doc” points at the page that explains the implementation.

Legend: **Implemented** = end-to-end path exists and is tested or verified; **Partial** = a meaningful subset exists but a stated behaviour is missing; **Deferred** = not built; **Unverified** = built but no measurement/proof.

### Functional requirements

| ID | Status | Code evidence | Doc | Notes |
| --- | --- | --- | --- | --- |
| FR-01 | Implemented | `AuthController.ts`, `OidcProviderClient.ts`, `CompleteOidcLoginUseCase.ts` | [auth](auth-and-tenancy.md) | Authorization code + PKCE, JWKS/issuer/audience/nonce validation, JIT user, 15 min access token + rotating refresh cookie. Requires a configured IdP; `db:mint-token` remains a local tool. |
| FR-02 | Implemented | `OidcProviderClient.ts`, `TenantGuard.ts`, `RouterDatabaseClient.ts` | [auth](auth-and-tenancy.md) | Validated `tid` (Entra) or `hd` (Google) → router tenant → tenant DB, on login and every resource request. `iss`-only resolution remains unbuilt. |
| FR-03 | Implemented | `JoinEventUseCase.ts`, `RouterDatabaseClient.ts`, `router.event_codes` | [auth](auth-and-tenancy.md) | Global event code (SHA-256 stored), atomic expiry/capacity/revocation, anonymous user + membership + session. The PWA QR scanner is Phase 3. |
| FR-04 | Implemented | `apps/web` (`WorkspaceState`, `sessionStorage`) | [requirements](requirements.md) | The workspace is isolated per tab in `sessionStorage` and is never a path segment: the URL stays clean. `localStorage` is never used for it. |
| FR-05 | Implemented | `TenantWorkspaceGuard.ts`, `DrizzleMembershipRepository.ts` | [auth](auth-and-tenancy.md) | `X-Workspace-ID` + membership check on every protected request; only agents skip membership. |
| FR-06 | Implemented | `CreateNodeUseCase.ts`, `tenant.meta.schema.ts` | [domain](domain-model.md) | `typeKey` must be an ACTIVE class; attributes are persisted as JSONB. The dynamic PWA form and attribute validation are part of FR-04. |
| FR-07 | Implemented | `Node.ts`, `Edge.ts`, `EditProposal.ts` | [domain](domain-model.md) | `author_hash` is stored on graph objects; maintainer rights are enforced on approve/reject and author-only deletes. |
| FR-08 | Implemented | `CreateEdgeUseCase.ts`, `DrizzleEdgeRepository.ts` | [api](api-reference.md) | Domain/range is checked when `relationKey` resolves to a workspace object property; both endpoints must be in the workspace. Unknown relation keys are currently accepted. |
| FR-09 | Implemented | `ProposeOntologyClassUseCase.ts`, `ProposeDatatypePropertyUseCase.ts`, `ProposeObjectPropertyUseCase.ts`, `ActivateOntologyClassUseCase.ts` | [api](api-reference.md) | Classes, datatype properties and object properties can be proposed; classes can be activated (`PROPOSED` → `ACTIVE`). Class `system_key` is unique per workspace. There is no property-activation endpoint. |
| FR-10 | Implemented | `CreateProposalUseCase.ts`, `ApproveProposalUseCase.ts` | [domain](domain-model.md) | JSONB delta in `PENDING`; NODE, EDGE and ONTOLOGY targets apply polymorphically. Node/edge `applyDelta` only matches rows with `deleted_at IS NULL`. |
| FR-11 | Partial | `CreateThreadUseCase.ts`, `DrizzleDiscussionRepository.ts` | [domain](domain-model.md) | Threads/posts/votes exist; creating a proposal does **not** auto-open or link a thread. |
| FR-12 | Implemented | `proposalAuthorization.ts`, `Approve/RejectProposalUseCase.ts` | [domain](domain-model.md) | Only the target's `authorHash` may approve/reject; delta + status commit in one `UnitOfWork`. |
| FR-13 | Implemented | `AutoApplyProposalUseCase.ts`, `EditProposal.autoApply` | [domain](domain-model.md) | `MODERATOR`/`ADMIN` only; requires `community_score >= 10` and age `>= 14 days`. |
| FR-14 | Implemented | `CastVoteUseCase.ts`, `interactions_log` unique index | [domain](domain-model.md) | Immutable log; `UNIQUE(user_hash, target_id, target_type)` enforces one vote per user/target. |
| FR-15 | Implemented | `DrizzleInteractionRepository.applyScoreDelta`, `VoteValue.ts` | [domain](domain-model.md) | Synchronous atomic counter update in the same transaction; no CQRS buffer. |
| FR-16 | Implemented | `social.discussion_posts`, discussion use cases | [api](api-reference.md) | Nested replies (`parent_post_id`), close thread, author-only soft delete. |
| FR-17 | Partial | `apps/worker-extractor`; `meta.data_sources` + `GET /api/v1/ingestion/resolve-source` ([ADR-0025](decisions/ADR-0025-source-resolution-route.md)) | [architecture](architecture.md) | The worker masks the PII locally, extracts a draft and creates a `PENDING` node. **Nothing publishes `stream:source_raw` yet** — the ingestion gateway is missing — and the name masker is heuristic. |
| FR-18 | Implemented | `SetNodeEmbeddingUseCase.ts`, `PUT /api/v1/nodes/:id/embedding` (agent-only), `apps/worker-embedder` (Ollama consumer) | [architecture](architecture.md) | `NODE_CREATED` → embedder → `nomic-embed-text` (768) → `nodes.embedding` + `embedding_model`/`embedded_at`; the HNSW index is exercised. Verified end to end; the worker is not in Compose/CI yet and there is no backfill for pre-existing nodes. |
| FR-19 | Implemented | `apps/worker-relacionador`; `GET /api/v1/nodes/:id/neighbors` ([ADR-0022](decisions/ADR-0022-relator-neighbour-lookup.md)); `POST /api/v1/edges`; merge proposals ([ADR-0026](decisions/ADR-0026-merge-contract.md)) | [architecture](architecture.md) | The Relator consumes `NODE_CREATED`, reads the top-5 neighbours through the API, asks the local LLM and creates `PENDING` edges. A `MERGE` verdict is submitted as a merge proposal (`kind: "MERGE"`); the API applies the merge — the duplicate becomes `MERGED`, the survivor absorbs it and its edges are re-pointed — when the proposal is approved. |
| FR-20 | Deferred | `apps/worker-consolidador` (empty); `packages/worker-shared` | [architecture](architecture.md) | No opportunity entity, endpoint or scheduled synthesis. |

### Non-functional requirements

| ID | Status | Code evidence | Doc | Notes |
| --- | --- | --- | --- | --- |
| NFR-01 | Partial | `GetSubgraphUseCase.ts`, recursive CTE + edge indexes | [architecture](architecture.md) | Endpoint is bounded (`depth ≤ 3`, `limit ≤ 200`) and indexed; no p95 measurement. |
| NFR-02 | Partial | `nodes.embedding vector(768)`, `idx_nodes_embedding_hnsw` | [domain](domain-model.md) | Vectors are produced and the planner uses the HNSW index for `ORDER BY embedding <=> $1`; the p95 target over 100k vectors is still unmeasured. |
| NFR-03 | Unverified | synchronous use cases | [testing](testing.md) | No load test; `p95 < 15 ms` has not been proven. |
| NFR-04 | Implemented | `keyset.ts`, list repositories | [architecture](architecture.md) | Opaque keyset pagination on nodes, edges, proposals, threads and posts. |
| NFR-05 | Implemented | `auth.users` schema, OIDC flow, no password column | [auth](auth-and-tenancy.md) | No local passwords or hashes. Institutional users authenticate at the IdP; the API validates the ID token and issues its own bearer session. |
| NFR-06 | Partial | `apps/worker-extractor` (`pii.py`) | [architecture](architecture.md) | The Extractor masks emails, phone numbers, long digit runs and id-like groups before any text reaches the model; personal names are matched heuristically, so a name that looks like a common noun is not masked. The ingestion producer is still missing. |
| NFR-07 | Implemented | `AuthorHash.ts`, `auth.users.author_hash` | [auth](auth-and-tenancy.md) | Opaque 64-hex pseudonym per user, carried verbatim; no salt. Requirement wording about “SHA-256 + salt” is superseded. |
| NFR-08 | Implemented | `RateLimitingMiddleware.ts` | [auth](auth-and-tenancy.md) | Per-actor and per-workspace fixed windows in Redis; fail-open on Redis errors. |
| NFR-09 | Unverified | — | [runbook-ops](runbook-ops.md) | No SLA evidence, metrics or load profile; not deployed. |
| NFR-10 | Partial | `RedisEventPublisher.ts`; `packages/worker-shared` consumer runtime; `apps/worker-embedder`; `apps/worker-relacionador` | [architecture](architecture.md) | Publication is post-commit and best-effort; Redis outages drop events (no outbox). Two workers consume `stream:node_created` with groups/`XAUTOCLAIM`/DLQ; the Extractor and Consolidator have no handler yet. |
| NFR-11 | Implemented | `apps/api/src/domain`, manual Composition Root | [conventions](conventions.md) | `domain/` imports no Fastify/Drizzle/pg; adapters are wired explicitly in `server.ts`. |

## Reading paths

| If you are… | Start with |
| --- | --- |
| A new contributor | [README](../README.md) → [architecture](architecture.md) → [conventions](conventions.md) → [runbook-dev](runbook-dev.md) → [testing](testing.md) |
| An API consumer | [api-reference](api-reference.md) → [errors](errors.md) → [auth-and-tenancy](auth-and-tenancy.md) |
| Operating the API | [runbook-ops](runbook-ops.md) → [architecture](architecture.md) → [testing](testing.md) |
| Reviewing the design | [requirements](requirements.md) → [domain-model](domain-model.md) → [decisions/](decisions/) → [ROADMAP](../ROADMAP.md) |

## Documentation rules

- Code is authoritative. When a document and the implementation disagree, fix the document in the same change.
- Mark planned work explicitly (“planned”, “deferred”, “not built”); never describe it in the present tense.
- Update the status matrix when a requirement moves between Implemented / Partial / Deferred / Unverified.
- Link to the final pages in this set, not to the frozen tree under
  `docs/archive/spec-v1/`.

## Known gaps and debt

- **Auth works but needs an IdP.** FR-01/02/03 endpoints, refresh and logout exist and are unit-tested; no IdP runs in Compose, so local development still uses `db:mint-token`. The PWA login/QR UI is Phase 3. Event codes live in the router DB by explicit exception ([ADR-0019](decisions/ADR-0019-global-event-codes.md)).
- **Lint is red.** 24 pre-existing `@typescript-eslint/no-explicit-any` errors; CI does not run lint. Do not claim `pnpm lint` passes.
- **M-12:** `public.edit_proposals.target_id` is polymorphic and has no foreign key. The target is validated at creation and before resolution; this is the accepted interim decision.
- **The async pipeline covers two of the three agents.** The embedder stores vectors and the Relator proposes `PENDING` edges and merge proposals; the Extractor has no producer and the Consolidator has no handler. The workers run in the `workers` Compose profile and their tests are a CI job; pre-existing nodes are not backfilled. See [ADR-0020](decisions/ADR-0020-dedicated-embedding-pipeline.md), [ADR-0022](decisions/ADR-0022-relator-neighbour-lookup.md), [ADR-0023](decisions/ADR-0023-relator-edge-and-merge-semantics.md) and [ADR-0026](decisions/ADR-0026-merge-contract.md).
- **No load/availability proof.** NFR-01/02/03/09 remain unverified.
- **No Apache AGE adapter.** The bounded SQL CTE is the read path; AGE mirroring/backfill is a separate milestone.
- **No observability stack.** Pino logs + `x-correlation-id` only; no metrics, tracing or dashboards.

When changing a requirement’s status, update this matrix and the corresponding doc in the same change.
