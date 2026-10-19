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
- 15 test files / 60 tests green; `build` + `type-check` green; thin CI runs
  install + `build type-check test`.
- Not started: real auth endpoints, Python workers, PWA, observability,
  integration/E2E/load tests.
- Known debt: `pnpm lint` is red (26 pre-existing `@typescript-eslint/no-explicit-any`
  errors); `PATCH`-style limitations are documented in the ADRs.

## Batch 1U — Close-out (done in this change set)

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

## Batch 1V — Auth flow (next)

Goal: close the last API-core gap (FR-01/02/03) and make the pseudonym model
real. Decisions to settle at kickoff: refresh-token strategy (rotating refresh
JWT vs. opaque token), PWA token storage, and whether `iss` resolution is
needed in addition to `tid`.

- [ ] `event_codes` table (tenant DB) + migration: code, workspace, expiry,
      revocation, created_by.
- [ ] `POST /api/v1/auth/login` — build the OIDC authorization URL (state +
      nonce, PKCE), redirect to the IdP.
- [ ] `GET /api/v1/auth/callback` — exchange the code, validate the ID token,
      upsert `auth.users`, assign a **random** `author_hash` on first login,
      resolve membership, issue the internal JWT (+ refresh).
- [ ] `POST /api/v1/auth/event-join` — validate an `event_code`, create or
      reuse an `ANONYMOUS_EVENT` user with a random pseudonym, issue a device
      token; refuse new joins after the event closes.
- [ ] `POST /api/v1/auth/logout` — revoke `jti` via `RedisTokenBlacklist`.
- [ ] Refresh endpoint + rotation/revocation semantics; tests (mocked IdP
      discovery/token/userinfo; no network); update `auth-and-tenancy.md`,
      `runbook-dev.md`, the status matrix and `.env.example` if needed.

## Phase 2 — AI pipeline (workers)

Kickoff decisions (record as ADRs before coding):

- [ ] Embedding pipeline design (FR-18): dedicated embedder consumer vs.
      Relator-inline; how it writes back without breaking API-only writes
      (leading option: agent-only endpoint such as
      `PUT /api/v1/nodes/:id/embedding`).
- [ ] Batch ingestion contract: `POST /api/v1/nodes/batch` (schema exists) vs.
      single-node loop; add the route if batching wins.
- [ ] Worker stack: Python 3.12, dependency manager, shared client/config
      library, consumer-group naming, `XAUTOCLAIM` recovery.

Milestones:

- [ ] 2.1 Worker scaffold + shared Python library (env, logging with
      `x-correlation-id`, JWT minting/refresh for agent identities, API client,
      Redis Streams consumer with consumer groups and retries, tests).
- [ ] 2.2 `meta.data_sources` registry + `GET /api/v1/ingestion/resolve-source`
      (ADR-0009).
- [ ] 2.3 Extractor: `stream:source_raw` → PII masking → Ollama → API drafts
      ([spec](docs/spec/extractor.md)).
- [ ] 2.4 Embedding computation: `NODE_CREATED` → `nomic-embed-text` (768) →
      `public.nodes.embedding` + HNSW index verified
      ([FR-18](docs/requirements.md)).
- [ ] 2.5 Relator: vector top-5 → LLM evaluation → merge/edge proposals
      ([spec](docs/spec/relator.md)).
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
      PG18+AGE+pgvector image or Testcontainers) + Redis.
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
- `iss`-based tenant resolution (currently `tid` only).
- Multi-region / HA topology (not designed).

## How to take a task

`.claude/commands/next-task.md` describes the executor workflow; follow it,
then mark the checkbox here with a one-line result and update
[docs/README.md](docs/README.md) if a requirement status changed.
