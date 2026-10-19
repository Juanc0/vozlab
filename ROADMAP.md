# Roadmap

Open work only. Completed tasks, the old phase plan and the per-task prompts are
frozen in [docs/archive/](docs/archive/); the decision record is
[docs/decisions/](docs/decisions/) and the component specs are
[docs/spec/](docs/spec/).

**Rules:** one checkbox = one PR-sized batch that leaves `pnpm turbo run build
type-check test` green; update the status matrix in [docs/README.md](docs/README.md)
when a requirement moves; if a task is ambiguous, stop and ask with options and
trade-offs before coding.

## Current state (2026-10-19)

- API core complete: nodes, edges, proposals/governance, ontology, discussions,
  interactions/votes, subgraph, multi-tenancy, rate limiting, soft delete,
  keyset pagination, event publication.
- Auth flow complete (FR-01/02/03): OIDC login/callback with PKCE, JIT accounts,
  rotating refresh sessions, logout, `/auth/me` and event-code join.
- 27 test files / 127 TypeScript unit tests green; opt-in integration suite
  (4 files / 23 tests) green against local PostgreSQL/Redis; Python worker
  runtime has 72 green tests (`uv run pytest`); `build` + `type-check` green;
  thin CI runs install + `build type-check test` (TypeScript only).
- Phase 2 in progress: shared `vozlab_worker` runtime, the dedicated embedder
  (FR-18 implemented end to end), the Relator (FR-19 partial — merges are
  logged, not applied) and the source registry + resolution route (FR-17
  prerequisite). Extractor and Consolidator handlers, PWA (including its
  login/QR UI), observability and broad integration/E2E/load tests are not
  started.
- Known debt: `pnpm lint` is red (26 pre-existing `@typescript-eslint/no-explicit-any`
  errors); `PATCH`-style limitations are documented in the ADRs.

## Batch 1U — Close-out (done)

- [x] B1: `DrizzleNodeRepository.applyDelta` filters `deleted_at`, so an
      auto-applied proposal cannot mutate a soft-deleted node.
- [x] L-13: removed the no-op `resolveAuthorHash(userHash, userHash)` from
      `CastVoteUseCase`.
- [x] M-12: `UNIQUE(workspace_id, system_key)` on `meta.ontology_classes`
      (migration `0002`); polymorphic proposal targets stay validated at
      creation and documented.
- [x] Pseudonymity: random opaque per-user `author_hash`, no salt
      ([ADR-0013](docs/decisions/ADR-0013-random-opaque-pseudonym.md)); the
      guard requires the `authorHash` claim.
- [x] Type-check covers `apps/api/tests/**` and `packages/database/scripts/**`
      (`tsconfig.tests.json`, `tsconfig.scripts.json`, `pnpm type-check`).
- [x] Thin CI: `.github/workflows/ci.yml`.
- [x] Documentation restructure + archive; `TODO.md`/`EXECUTION_PLAN.md`
      replaced by this file.

## Batch 1V — Auth flow (done)

Goal: close the last API-core gap (FR-01/02/03) and make the pseudonym model
real. Decisions: rotating **opaque** refresh token in an `HttpOnly` cookie
(access JWT stays in memory), and tenant resolution from `tid` (Entra) or `hd`
(Google Workspace); `iss`-only resolution stays unscheduled.
Result: 114 tests green; `build` + `type-check` green.

- [x] `router.event_codes` registry + migration (global exception to ADR-0002,
      [ADR-0019](docs/decisions/ADR-0019-global-event-codes.md)): hashed code,
      tenant/workspace, expiry, revocation, capacity, created_by.
- [x] `GET /api/v1/auth/login` — OIDC authorization URL with state + nonce and
      PKCE S256; state stored single-use in Redis for 10 minutes.
- [x] `GET /api/v1/auth/callback` — exchange the code, validate the ID token
      with JWKS/issuer/audience/nonce, resolve `tid`/`hd`, JIT-upsert
      `auth.users` with a **random** `author_hash`, and set the refresh cookie
      (the PWA obtains the access token via `/auth/refresh`). JIT grants **no**
      workspace membership.
- [x] `POST /api/v1/auth/event-join` — atomically consume the event code,
      create an `ANONYMOUS_EVENT` user with a random pseudonym, add the
      workspace membership and issue a session; expired/revoked codes block
      new joins only.
- [x] `POST /api/v1/auth/logout` — blacklist `jti`, revoke the refresh family,
      clear the cookie.
- [x] `POST /api/v1/auth/refresh` — rotate the opaque token; reuse revokes the
      whole family. Refresh sessions are stored hashed in the tenant DB.
- [x] `GET /api/v1/auth/me` — profile plus workspace memberships, no
      `X-Workspace-ID` required.
- [x] Operator CLI `db:event-code`, tests (mocked IdP/JWKS, no network) and
      docs (ADR-0018, auth guide, API/errors/domain, runbooks, status matrix,
      `.env.example`).

## Phase 2 — AI pipeline (workers)

Kickoff decisions (record as ADRs before coding):

- [x] Embedding pipeline design (FR-18): dedicated embedder consumer;
      agent-only write-back via `PUT /api/v1/nodes/:id/embedding`; Relator
      retries until a vector exists
      ([ADR-0020](docs/decisions/ADR-0020-dedicated-embedding-pipeline.md)).
- [x] Batch ingestion contract: `POST /api/v1/nodes/batch` (schema exists) vs.
      single-node loop; add the route if batching wins. Result: single-node
      loop, no batch route
      ([ADR-0024](docs/decisions/ADR-0024-no-batch-node-endpoint.md)) — the rate
      limiter counts requests, so a bulk route would bypass the write budget.
- [x] Worker stack: Python 3.12 + uv, shared client/config library,
      per-worker consumer groups, `XAUTOCLAIM` recovery
      ([ADR-0021](docs/decisions/ADR-0021-python-worker-runtime.md)).

Milestones:

- [x] 2.1 Worker scaffold + shared Python library (env, logging with
      `x-correlation-id`, JWT minting/refresh for agent identities, API client,
      Redis Streams consumer with consumer groups and retries, tests). Result:
      uv workspace, `packages/worker-shared` + `apps/worker-embedder` scaffold,
      72 Python tests (the embedder handler landed with 2.4, the Relator with 2.5).
- [x] 2.2 `meta.data_sources` registry + `GET /api/v1/ingestion/resolve-source`
      (ADR-0009). Result: registry + agent-only, tenant-scoped resolution route
      ([ADR-0025](docs/decisions/ADR-0025-source-resolution-route.md)); no
      management route for the registry yet.
- [ ] 2.3 Extractor: `stream:source_raw` → PII masking → Ollama → API drafts
      ([spec](docs/spec/extractor.md)).
- [x] 2.4 Embedding computation: `NODE_CREATED` → `nomic-embed-text` (768) →
      `public.nodes.embedding` + HNSW index verified
      ([FR-18](docs/requirements.md)). Result: dedicated embedder worker
      (ADR-0020) + agent-only `PUT /api/v1/nodes/:id/embedding`, `embedding_model`
      /`embedded_at` columns, HNSW index exercised, verified end to end against
      the local stack; the worker is not in Compose/CI yet (2.7) and there is no
      backfill for pre-existing nodes.
- [x] 2.5 Relator: vector top-5 → LLM evaluation → merge/edge proposals
      ([spec](docs/spec/relator.md)). Result: `apps/worker-relacionador` reads
      the neighbours through the API (ADR-0022), asks the local LLM and creates
      `PENDING` edges; a `MERGE` verdict is logged, not applied — no merge
      contract exists yet (ADR-0023).
- [ ] 2.6 Consolidator: scheduled cluster synthesis → opportunity published via
      the API ([spec](docs/spec/consolidator.md)); add the opportunity endpoint.
- [ ] 2.7 Worker Dockerfiles + compose profiles + worker tests; update
      `runbook-ops.md`.

## Phase 3 — PWA

- [ ] 3.1 SvelteKit 5 + Tailwind + PWA scaffold (SSR, service worker, manifest).
- [ ] 3.2 Runes state + per-tab `sessionStorage` workspace + HTTP client that
      injects `X-Workspace-ID`.
- [ ] 3.3 Route groups `(auth)` / `(app)`; clean URLs.
- [ ] 3.4 Cytoscape graph canvas + subgraph loading.
- [ ] 3.5 Node/edge creation, proposal review (approve/reject), discussions and
      voting UI with optimistic updates.
- [ ] 3.6 PWA/offline shell, install prompt, accessibility pass.
- [ ] 3.7 Playwright E2E for the critical journeys (see `spec/web-pwa.md`).

## Phase 4 — Platform, QA and operations

- [ ] 4.1 Integration tests with ephemeral PostgreSQL (the repo's
      PG18+AGE+pgvector image or Testcontainers) + Redis. Auth flow suite exists
      against local Compose (`test:integration`); Testcontainers/CI and the
      remaining repositories are pending.
- [ ] 4.2 Coverage thresholds (re-enable `test.outputs: ["coverage/**"]`).
- [ ] 4.3 E2E suite in CI (Playwright).
- [ ] 4.4 Load tests (k6) proving NFR-01/02/03 or revising the targets.
- [ ] 4.5 Observability: Prometheus metrics, OpenTelemetry tracing, dashboards,
      alerts for the real failure modes; NFR-09 monitoring.
- [ ] 4.6 Image builds and deployment pipeline (API, workers, web) with
      migrations as a deploy step.
- [ ] 4.7 Pay down lint debt (`no-explicit-any`) and add lint back to CI.

## Tracked, not scheduled

- Apache AGE mirroring adapter ([ADR-0004](docs/decisions/ADR-0004-bounded-sql-cte-age-deferred.md)).
- Redis-buffered CQRS vote scoring ([ADR-0005](docs/decisions/ADR-0005-synchronous-vote-scoring.md)).
- SSE notifications ([ADR-0015](docs/decisions/ADR-0015-sse-deferred.md)).
- GraphQL facade ([ADR-0016](docs/decisions/ADR-0016-graphql-rejected.md)).
- `iss`-based tenant resolution (currently `tid`/`hd` only).
- Multi-region / HA topology (not designed).

## How to take a task

`.claude/commands/next-task.md` describes the executor workflow; follow it,
then mark the checkbox here with a one-line result and update
[docs/README.md](docs/README.md) if a requirement status changed.
