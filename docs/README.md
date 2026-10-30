# VozLab documentation

This is the entry point for the current documentation set. It replaces the v1
specification tree, now frozen under `docs/archive/spec-v1/`. If a statement
here conflicts with code, **the code is authoritative** — please fix the
document.

Status snapshot: **2026-10-30**. Phases 0–3 are complete and the auth/tenancy
intervention (v5/v6) is closed on code: OIDC with explicit institution
selection, multiple roles, GUEST/event kinds, ephemeral join codes, tenant and
global invitations, direct add by handle, persistent audit, per-action rate
limits, admin UI, offline and a real Zitadel login verified end to end
(`analysis/auth-onboarding-committee-review.md` §6.5). The db-baseline plan
landed the same day ([ADR-0044](decisions/ADR-0044-identity-vocabulary-coherence-and-migration-baseline.md)):
the identity storage speaks one `global_user_*` vocabulary and each DB
migrates from a single baseline fold; the dev volume was reset and
`test:integration` (38 tests) now runs green locally exactly as in CI. Phase 2
workers: embedder, Relator and Extractor are implemented; the Consolidator and
the ingestion producer are not. Phase 4: observability stack
(metrics/Prometheus/Grafana/Tempo, k6 smoke), containers and CI are defined;
the T2 production deployment is instrumented
([ADR-0043](decisions/ADR-0043-production-topology-caddy-t2.md))
pending a real hostname. Gates: `pnpm turbo run build type-check test` green
(≈352 API unit tests, ≈521 web tests, Python suite `uv run pytest`), lint 0
errors / ≈35 warnings. E2E Playwright: 17 green, 1 opt-in (`E2E_OIDC=1`), 14
red pending the graph-suite realignment (task 13). **CI green on GitHub
Actions since run 5 (2026-10-30, `176731a`)**; E2E is manual-dispatch until
task 13.

## Structure and lifecycle

| Directory | Role | Lifespan |
| --- | --- | --- |
| root `docs/*.md` | **Living reference** — one file per cross-cutting concern (architecture, domain model, API, errors, auth, conventions, design system, testing, tooling). Describes today's code only. | Permanent; edited in the same commit that changes the code. |
| [components/](components/) | **Per component/flow**: living doc when built, normative spec when not. Each file opens with a `STATUS:` banner (`BUILT` / `PARTIAL` / `NOT BUILT`). | Permanent; grows as components deepen. |
| [plans/](plans/README.md) | **Active work only.** `plans/<area>/v<N>.md` — versioned plans whose tasks are worked slice by slice. | A plan lives until its closure checklist passes; then it moves whole to `archive/plans/`. |
| [requirements.md](requirements.md) | Normative FR/NFR text. | Permanent (versioned by content). |
| [ops/](ops/) | Runbooks (how-to): dev, ops, demo, production deployment, social logins, Floci. | Permanent. |
| [knowledge/](knowledge/) | **Deep explanation not yet realized as code** (data/DB operations, AI pipeline & models, graph/ontology strategy, dependency lifecycle, i18n, security baseline). Each file states which future plan will graduate it into `components/`. | Until absorbed; then archived. |
| [analysis/](analysis/) | Records of **open** interventions (working documents). | Archived when the intervention closes. |
| [decisions/](decisions/) | ADRs — append-only decision log. Supersede by new ADR; never rewrite; mechanical link fixes allowed. | Permanent. |
| [archive/](archive/) | **The only cemetery.** `tasks/`, `notes/`, `plans/` (closed), `reviews/`, `research/`, `history/`, `knowledge-transfer/`, `guia-identidad-ia/`, `spec-v1/`. Frozen; never edited, never load-bearing for current truth. | Permanent. |

### The working cycle (component by component, flow by flow)

1. **Pick one area** (a component, a flow, a connection). Read its living doc
   in `components/`, the relevant ADRs, `knowledge/` material and the open
   items in ROADMAP.
2. **Open a plan**: `plans/<area>/v1.md`. Each task is one line with: exact
   acceptance, layer(s) touched, **where the evidence will land** (which
   living doc / which ADR), size. Plans can slice vertically (flow by flow)
   or horizontally (layer by layer) — the plan declares which.
3. **Work task by task.** One commit per task batch keeps code + living doc +
   ROADMAP consistent (the same-commit principle). A task that uncovers a
   decision spawns an ADR, not a paragraph in the plan.
4. **Never lose a sliver.** An unfinished detail is either (a) copied into the
   next version (`v<N+1>`) with its origin cited, or (b) moved to ROADMAP
   "Tracked, not scheduled". It does not stay alive in prose or in a note.
5. **Close the plan** with its checklist: implementation recorded in
   `components/<x>.md`; decisions in ADRs; remaining slivers re-homed; plan
   directory moved to `archive/plans/<area>/`; this README's status snapshot
   and the requirements matrix updated. Then the repo gains nothing new
   outside `archive/`.
6. **Iterate**: the next deep pass over the same area opens `v2.md` against a
   doc that already reflects `v1`'s reality.

## Live documents

| Document | Contents |
| --- | --- |
| [../README.md](../README.md) | Project overview, status, quickstart, commands |
| [architecture.md](architecture.md) | Context/container view, request path, channels and guarantees, failure modes, two-DB topology, runtime facts |
| [requirements.md](requirements.md) | Normative FR-01…FR-20 and NFR-01…NFR-11 text and acceptance criteria |
| [domain-model.md](domain-model.md) | Entities, schemas, state machines, soft-delete and vote rules |
| [auth-and-tenancy.md](auth-and-tenancy.md) | OIDC flow (participants, trust boundaries, multi-institution selection), sessions, guards, workspace isolation, pseudonymity |
| [conventions.md](conventions.md) | Layering, NodeNext imports, naming, errors, events, pagination |
| [design-system.md](design-system.md) | The design system: the tokens, the type, the house rules a new surface follows |
| [graph-engine-research.md](graph-engine-research.md) | The graph engine: the research of 2026-10-21, the shortlist and the order of work |
| [api-reference.md](api-reference.md) | Endpoint catalogue, headers, payloads, status codes |
| [errors.md](errors.md) | Canonical `ERR_*` catalogue and HTTP mapping |
| [testing.md](testing.md) | Test layering, current coverage, CI, known gaps |
| [agent-tooling.md](agent-tooling.md) | Skills, subagents, slash commands and MCP servers used to work on VozLab |
| [components/](components/) | Per component/flow docs with STATUS banners: extractor, relator, web-pwa (BUILT); ci-cd (PARTIAL); consolidator, dns-domain-verification (NOT BUILT) |
| [plans/](plans/README.md) | Active work plans — today [identity-consolidation/v1](plans/identity-consolidation/v1.md); the backlog otherwise lives in ROADMAP |
| [ops/runbook-dev.md](ops/runbook-dev.md) | Local bootstrap, migrations, seed, tokens, troubleshooting |
| [ops/runbook-ops.md](ops/runbook-ops.md) | Runtime topology, health checks, shutdown, operational readiness checklist |
| [ops/runbook-demo-zrok.md](ops/runbook-demo-zrok.md) | Local demo through three reserved zrok shares + presenter script/checklist + parity rules |
| [ops/production-deployment.md](ops/production-deployment.md) | Production runbook (topology T2, [ADR-0043](decisions/ADR-0043-production-topology-caddy-t2.md)): DNS → Zitadel → OIDC 7-URL matrix → Caddy → verificación |
| [ops/zitadel-social-logins.md](ops/zitadel-social-logins.md) | B9: provisioning Google/Microsoft as generic OIDC IdPs; external credential setup pending |
| [ops/floci-terraform.md](ops/floci-terraform.md) | Floci AWS emulation + Terraform skeleton workflow |
| [knowledge/](knowledge/) | Deep material awaiting realization (see each file's graduation path) |
| [analysis/auth-onboarding-committee-review.md](analysis/auth-onboarding-committee-review.md) | **Live record** of the identity/auth intervention (B1–B14 + task 13); archived when it closes |
| [analysis/db-identity-normalization.md](analysis/db-identity-normalization.md) | Approved design record for the identity DB work (DEC-1..8); Plan 1 executed (ADR-0044), DEC-3/4/5 feed identity-consolidation |
| [analysis/db-auth-router-flows-audit.md](analysis/db-auth-router-flows-audit.md) | **Live audit** (2026-10-30): router + tenant `auth` flow↔table↔column map, findings P1–P9, reset/seed ruling, open decisions D-1..5 |
| [analysis/production-topology-b11.md](analysis/production-topology-b11.md) | Live analysis feeding ADR-0043; archived after first go-live |
| [decisions/](decisions/) | Architecture Decision Records (`ADR-*.md`) |
| [../ROADMAP.md](../ROADMAP.md) | The single task board: open work, deferred items, known debt |
| [archive/](archive/) | **Frozen history** — the only place process documents go. Not maintained. |

## Requirements status

Status reflects the code on 2026-10-29. Normative text lives in [requirements.md](requirements.md); “Doc” points at the page that explains the implementation.

Legend: **Implemented** = end-to-end path exists and is tested or verified; **Partial** = a meaningful subset exists but a stated behaviour is missing; **Deferred** = not built; **Unverified** = built but no measurement/proof.

### Functional requirements

| ID | Status | Code evidence | Doc | Notes |
| --- | --- | --- | --- | --- |
| FR-01 | Implemented | `AuthController.ts`, `OidcProviderClient.ts`, `CompleteOidcLoginUseCase.ts` | [auth](auth-and-tenancy.md) | Authorization code + PKCE, JWKS/issuer/audience/nonce validation, JIT user, 15 min access token + rotating refresh cookie. Zitadel ships in Compose (`idp` profile) and the real login is E2E-verified (committee §6.5); `db:mint-token` remains the no-IdP dev path. |
| FR-02 | Implemented | `OidcProviderClient.ts`, `TenantGuard.ts`, `RouterDatabaseClient.ts` | [auth](auth-and-tenancy.md) | Institution resolved from the validated ID-token org claim (`urn:zitadel:iam:org:id`, ADR-0031) → router `tenants.oidc_tenant_id` → tenant DB; multi-institution identities go through `select-tenant`/`switch-tenant` (v5/v6). |
| FR-03 | Implemented | `JoinEventUseCase.ts`, `RouterDatabaseClient.ts`, `router.event_codes` | [auth](auth-and-tenancy.md) | Global event code (SHA-256 stored), atomic expiry/capacity/revocation, anonymous user + GUEST membership in a kind-EVENT workspace + session. The PWA QR scanner is not built (join is by typed code). |
| FR-04 | Implemented | `apps/web` (`WorkspaceState`, `sessionStorage`) | [web-pwa](components/web-pwa.md) | The workspace is isolated per tab in `sessionStorage`; `localStorage` is never used for it. |
| FR-05 | Implemented | `TenantWorkspaceGuard.ts`, `DrizzleMembershipRepository.ts` | [auth](auth-and-tenancy.md) | `X-Workspace-ID` + membership check on every protected request; only agents skip membership. |
| FR-06 | Implemented | `CreateNodeUseCase.ts`, `tenant.meta.schema.ts` | [domain](domain-model.md) | `typeKey` must be an ACTIVE class; attributes persisted as JSONB. |
| FR-07 | Implemented | `Node.ts`, `Edge.ts`, `EditProposal.ts` | [domain](domain-model.md) | `author_hash` on graph objects; maintainer rights on approve/reject and author-only deletes. |
| FR-08 | Implemented | `CreateEdgeUseCase.ts`, `DrizzleEdgeRepository.ts` | [api](api-reference.md) | Domain/range checked when `relationKey` resolves; unknown relation keys currently accepted. |
| FR-09 | Implemented | ontology proposal/activation use cases | [api](api-reference.md) | Classes/datatype/object properties proposable; classes activatable. **No property-activation endpoint** (ontology governance gap G-flags in [knowledge/graph-and-ontology-strategy.md](knowledge/graph-and-ontology-strategy.md)). |
| FR-10 | Implemented | `CreateProposalUseCase.ts`, `ApproveProposalUseCase.ts` | [domain](domain-model.md) | JSONB delta `PENDING`; NODE/EDGE/ONTOLOGY polymorphic; EDIT/MERGE union ([ADR-0026](decisions/ADR-0026-merge-contract.md)). |
| FR-11 | Partial | `CreateThreadUseCase.ts`, `DrizzleDiscussionRepository.ts` | [domain](domain-model.md) | Threads/posts/votes exist; proposals do **not** auto-open a thread. |
| FR-12 | Implemented | `proposalAuthorization.ts` | [domain](domain-model.md) | Only the target's `authorHash` approves/rejects; delta + status in one `UnitOfWork`. |
| FR-13 | Implemented | `AutoApplyProposalUseCase.ts` | [domain](domain-model.md) | `MODERATOR`/`ADMIN`; `community_score >= 10`, age `>= 14 days`. |
| FR-14 | Implemented | `CastVoteUseCase.ts` | [domain](domain-model.md) | Immutable log; one vote per `(user_hash, target)`. |
| FR-15 | Implemented | `applyScoreDelta` | [domain](domain-model.md) | Synchronous atomic counter in the same transaction (ADR-0005). |
| FR-16 | Implemented | `social.discussion_posts`, use cases | [api](api-reference.md) | Nested replies, close thread, author-only soft delete. Content has no language column (i18n plan: [knowledge/internationalization-strategy.md](knowledge/internationalization-strategy.md)). |
| FR-17 | Partial | `apps/worker-extractor`; `meta.data_sources` + resolve-source route ([ADR-0025](decisions/ADR-0025-source-resolution-route.md)) | [extractor](components/extractor.md) | Worker masks PII, drafts and creates `PENDING` nodes. **Nothing publishes `stream:source_raw`** — the producer/gateway is missing. |
| FR-18 | Implemented | embedder worker, `PUT /nodes/:id/embedding` | [architecture](architecture.md) | Verified end to end; worker runs in the `workers` profile and its image builds in CI. **No backfill** for pre-existing nodes. |
| FR-19 | Implemented | relator worker, neighbours route ([ADR-0022](decisions/ADR-0022-relator-neighbour-lookup.md)) | [relator](components/relator.md) | Consumes `NODE_CREATED`, creates `PENDING` edges; MERGE verdicts become merge proposals applied on approval ([ADR-0023](decisions/ADR-0023-relator-edge-and-merge-semantics.md), [ADR-0026](decisions/ADR-0026-merge-contract.md)). |
| FR-20 | Deferred | — | [consolidator](components/consolidator.md) | `apps/worker-consolidador` does not exist; no opportunity entity/endpoint. |

### Non-functional requirements

| ID | Status | Code evidence | Doc | Notes |
| --- | --- | --- | --- | --- |
| NFR-01 | Partial | `GetSubgraphUseCase.ts` | [architecture](architecture.md) | Bounded + indexed; no p95 measurement. |
| NFR-02 | Partial | HNSW `idx_nodes_embedding_hnsw` | [domain](domain-model.md) | Index exercised; p95 over 100k vectors unmeasured; the filtered-recall defect (F-04) is analysed in [knowledge/data-and-database-operations.md](knowledge/data-and-database-operations.md). |
| NFR-03 | Unverified | — | [testing](testing.md) | k6 smoke exists; no load profile proven. |
| NFR-04 | Implemented | `keyset.ts` | [architecture](architecture.md) | Keyset pagination everywhere. |
| NFR-05 | Implemented | no password column, OIDC flow | [auth](auth-and-tenancy.md) | No local credentials. |
| NFR-06 | Partial | extractor `pii.py` | [extractor](components/extractor.md) | Heuristic name masking; raw records still reach Redis (S-10, [knowledge/security-baseline.md](knowledge/security-baseline.md)). |
| NFR-07 | Implemented | `AuthorHash.ts` | [auth](auth-and-tenancy.md) | Opaque random pseudonym (ADR-0013). |
| NFR-08 | Implemented | `RateLimitingMiddleware.ts` | [auth](auth-and-tenancy.md) | Per-actor fixed windows + `scoped()` per-action buckets; behind the proxy `req.ip` resolves via trusted XFF (`proxyTrust.ts`). |
| NFR-09 | Unverified | `/metrics` + Prometheus/Grafana/Tempo profiles | [runbook-ops](ops/runbook-ops.md) | Stack defined (4.5); no SLA, not deployed. |
| NFR-10 | Partial | `RedisEventPublisher.ts`, consumer runtime with `XAUTOCLAIM`/DLQ | [architecture](architecture.md) | Post-commit best-effort publication; no outbox (F-12). |
| NFR-11 | Implemented | domain purity + Composition Root | [conventions](conventions.md) | Enforced by review + import boundaries. |

## Reading paths

| If you are… | Start with |
| --- | --- |
| A new contributor | [README](../README.md) → [architecture](architecture.md) → [conventions](conventions.md) → [runbook-dev](ops/runbook-dev.md) → [testing](testing.md) |
| An API consumer | [api-reference](api-reference.md) → [errors](errors.md) → [auth-and-tenancy](auth-and-tenancy.md) |
| Working on a component | [components/](components/) the component file → [knowledge/](knowledge/) related deep doc → [plans/](plans/README.md) if there is an open plan → [ROADMAP](../ROADMAP.md) |
| Operating the API | [runbook-ops](ops/runbook-ops.md) → [production-deployment](ops/production-deployment.md) → [architecture](architecture.md) |
| Reviewing the design | [requirements](requirements.md) → [domain-model](domain-model.md) → [decisions/](decisions/) → [ROADMAP](../ROADMAP.md) |

## Documentation rules

- **Code is authoritative.** When a document and the implementation disagree, fix the document in the same change.
- Mark planned work explicitly (“planned”, “deferred”, “not built”); never describe it in the present tense.
- Update the status matrix when a requirement moves between Implemented / Partial / Deferred / Unverified.
- Process documents (task prompts, status notes, closed plans) live their life in `plans/` and die in `archive/` — never in the living set. Nothing completed stays described as pending.
- A component's implementation record is its `components/<x>.md` + ADRs. When a plan closes, its tasks' knowledge must already be there; the plan file adds no unique facts worth keeping.
- Numbers in docs are generated or dated. Undated counts are treated as stale.
- Link to the pages in this set, not to the frozen trees under `docs/archive/`.

## Known gaps and debt

- **Task 13**: 14 graph E2E journeys are red — toolbar redesign drift (3.57–3.64); the `graph.intro` copy still promises the «Lista» toggle (a11y gap). Options recorded in the committee doc §5.
- **The async pipeline covers two of the three agents** (plus extractor without producer): the Consolidator has no handler, nothing publishes `stream:source_raw`, pre-existing nodes are not backfilled ([ADR-0020](decisions/ADR-0020-dedicated-embedding-pipeline.md), [ADR-0022](decisions/ADR-0022-relator-neighbour-lookup.md), [ADR-0023](decisions/ADR-0023-relator-edge-and-merge-semantics.md), [ADR-0026](decisions/ADR-0026-merge-contract.md)).
- **M-12:** `public.edit_proposals.target_id` is polymorphic with no FK — accepted interim decision.
- **No load/availability proof.** NFR-01/02/03/09 unverified.
- **No Apache AGE adapter.** Bounded SQL CTE is the read path.
- **Security open items** (verified 2026-10-29, full table in [knowledge/security-baseline.md](knowledge/security-baseline.md)): committed credential in `opencode.json` (S-02), plaintext router password in envs (S-03), dev DB ports unbound (S-05), unpinned images (S-12), unattended agent approvals (S-15).
- **Identity slivers** from the closed intervention, tracked in ROADMAP: external social-login credentials (B9), production hostname + staging CSP (B11), cleanup cron (optional), invitation QR, `workspaces.kind` DB CHECK, workspace-level `auto_approve_join_code` dead flag, F4 PII inventory.

When changing a requirement's status, update this matrix and the corresponding doc in the same change.