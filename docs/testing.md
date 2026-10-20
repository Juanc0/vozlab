# Testing Strategy

Current automated tests are **TypeScript unit tests by default, an opt-in auth
integration suite, a web unit suite, and a Python worker-runtime suite**. This
page records what is green today, what is deliberately missing, and the Phase 4
plan.

## Current suites

| Item | Unit suite | Integration suite | Web suite |
| --- | --- | --- | --- |
| Runner | Vitest 2.1.9 | Vitest 2.1.9 | Vitest 5.0.5 (jsdom) |
| Location | `apps/api/tests/**/*.test.ts` (excluding `integration/`) | `apps/api/tests/integration/**/*.test.ts` | `apps/web/tests/**/*.test.ts` |
| Size | 29 files / 159 tests | 5 files / 29 tests | 19 files / 124 tests |
| Scope | Domain entities, value objects, use cases, auth/OIDC adapters, embedding write-back, neighbour lookup, source resolution, the merge contract, pure infrastructure helpers | Real HTTP auth flow, Drizzle/PostgreSQL persistence, Redis rotation/state, event-code join, agent-only embedding write-back, vector-search read path, source resolution, the merge proposal lifecycle | The app shell landmarks, the route components, the runtime API base URL resolution, the service-worker registration flow, the per-tab workspace state, the in-memory session, the HTTP client's headers and error envelope, the session guard, the workspace selector, the serialised refresh, the subgraph loading, the canvas lifecycle and the list view |
| Isolation | In-memory fakes; no PostgreSQL, Redis, HTTP or Ollama | Local docker-compose PostgreSQL/Redis plus an in-process mock OIDC provider | jsdom; no network, no service worker |
| Trigger | `pnpm test` (default, CI) | `pnpm --filter @vozlab/api test:integration` (manual/phase 4 CI) | `pnpm test` (default, CI) |
| Coverage | Not measured; no coverage provider installed | Not measured | Not measured |

The unit suite uses `tests/support/fakes.ts`, `tests/support/authFakes.ts` and
`tests/support/hash.ts` to exercise use cases without adapters.
`apps/api/vitest.config.ts` adds a Vite plugin that resolves NodeNext `./x.js`
specifiers to `./x.ts` sources, so tests can import application code unchanged.
A setup file (`tests/setup/env.ts`) fills the required environment variables;
`LOG_LEVEL=fatal` keeps expected negative-path logs out of the output.

Covered unit areas include node/edge/proposal state machines, authorization
rules, vote casting, thread closure, keyset pagination, timestamp ownership, the
connection pool manager, `AuthorHash` validation, PKCE/state construction,
OIDC ID-token verification (locally generated JWKS, nonce/audience/issuer
failures), JWT claim issuance, refresh rotation/reuse, logout, JIT user upsert,
`/auth/me`, event-code joins, and token/duration utilities. All network calls
use injected `fetch`; no IdP, PostgreSQL or Redis is contacted.

The auth integration suite starts the real `buildServer()` on an isolated port
(`13000` by default), uses the migrated/seeded `vozlab_router` and
`vozlab_tenant_dev` databases, Redis, and a mock OIDC provider on port `18080`.
It verifies JIT login, hashed refresh storage, rotation, reuse-family
revocation, logout/blacklist, unknown-tenant and unverified-email rejection,
event-code capacity, and anonymous membership. The mock provider is test-only
and signs ephemeral RS256 tokens; no external IdP is required.

The embedding integration suite (`embedding.integration.test.ts`) drives the
same server in-process with `app.inject()` and locally signed tokens: it
verifies that `AGENT_EMBEDDER` stores the vector (checking
`embedding_model`, `embedded_at` and `vector_dims` in PostgreSQL) and that
human callers, other agent types, foreign workspaces, malformed vectors and
unknown models are rejected.

The neighbour integration suite (`neighbors.integration.test.ts`) writes two
vectors through the same route and checks that
`GET /api/v1/nodes/:id/neighbors` returns the closest node with a similarity
above 0.99, never returns the source node, answers `409` while the node has no
vector, `404` for an unknown or foreign node and `422` for an out-of-range
limit.

The ingestion integration suite (`ingestion.integration.test.ts`) checks the
agent-only resolution route: the seeded source resolves to its workspace with
its behavior profile, a human token gets `403`, an unknown source gets `404`,
a missing `sourceId` gets `422` and an unauthenticated call gets `401`.

The merge integration suite (`merge.integration.test.ts`) drives the whole
proposal lifecycle against PostgreSQL: a `MERGE` proposal is created, read
back with its kind, approved, and the graph changes accordingly — the
duplicate becomes `MERGED` with `merged_into_id`, the survivor adopts the
attributes it did not have and the duplicate's edge is re-pointed. A second
pending merge proposal gets `409`, a merge into a node of another workspace
gets `404`, a merge into itself gets `422`, and a proposal without a `kind`
is still an edit proposal.

### Python worker runtime

The Phase 2 runtime has **105 Python tests** in
`packages/worker-shared/tests`, `apps/worker-embedder/tests`,
`apps/worker-relacionador/tests` and `apps/worker-extractor/tests`. They
cover environment validation, JSON logging and correlation context, agent-token
minting/static/file/dev providers, the `httpx` API client (auth/workspace/
correlation headers, typed errors, opt-in 5xx retries), retry backoff, the
Redis Streams consumer (`XREADGROUP`, idempotent group creation, `XAUTOCLAIM`,
delivery-count-based dead-lettering and `PermanentError`), the Ollama clients
(embedding and chat: endpoints, dimension checks, retryable vs permanent
failures), the embedder's `NODE_CREATED` handler (read node → embed → write
back), the Relator's handler and LLM client (neighbours → verdict → relation
key → edge, hallucinated targets, merge proposals, duplicate guard) and the
Extractor's PII masker, extraction client and handler (masking before the
model call, ontology fallback, duplicate guard, dead-letter classification).
Redis is simulated with `fakeredis`; HTTP with `httpx.MockTransport`. No live
Redis, Ollama, API or IdP is contacted. The app tests drive a full `--once`
pass over a fake stream.

`pytest` runs with `--import-mode=importlib` so two worker packages can use
the same test file names without a module-name collision.

**The Python suite is a CI job** (`astral-sh/setup-uv`, `uv sync --frozen`,
`uv run pytest`, `uv run ruff check` and `uv run ruff format --check`) and
the worker images are built on every pull request.

## Running tests

```bash
# Whole workspace (Turbo; only packages that define `test` run)
pnpm test

# API package only, one shot
pnpm --filter @vozlab/api test

# Watch mode
pnpm --filter @vozlab/api exec vitest

# One file or one test name
pnpm --filter @vozlab/api exec vitest run tests/domain/Node.test.ts
pnpm --filter @vozlab/api exec vitest run -t "rejects an invalid transition"
```

`pnpm test` depends on `^build`, so dependencies are type-checked first. Tests
are not emitted or bundled.

The auth integration suite is opt-in and expects the local services plus
migrations and the dev seed:

```bash
docker compose up -d postgres redis
pnpm --filter @vozlab/database db:migrate
pnpm --filter @vozlab/database db:seed:dev
pnpm --filter @vozlab/api test:integration
```

The Python worker runtime has its own toolchain (run from the repo root; uv
creates or reuses `.venv`):

```bash
uv sync
uv run pytest
uv run ruff check packages/worker-shared apps/worker-embedder
```

The integration suite listens on `13000` (API) and `18080` (mock OIDC) by
default; override with
`INTEGRATION_API_PORT` and `MOCK_OIDC_PORT`. It must not point at a production
database: the tests create and delete users and event codes.

## Type checking

```bash
pnpm turbo run build type-check
# equivalent root script
pnpm type-check
```

| Task | Config | What it covers |
| --- | --- | --- |
| `build` | `apps/api/tsconfig.json` | `src/**/*` only, `tsc --noEmit` |
| `type-check` (API) | `apps/api/tsconfig.tests.json` | `src/**/*` **and** `tests/**/*` |
| `type-check` (database) | `packages/database/tsconfig.scripts.json` | `src/**/*` and `scripts/**/*` |
| `type-check` (web) | `apps/web/tsconfig.json` | `src/**/*`, `tests/**/*` and the generated SvelteKit types, via `svelte-check` |
| `build` (shared-types) | package tsconfig | Zod schemas and DTOs |

Tests and DB scripts live outside `src/`, which is why they need the extra
configs. Both configs extend the strict NodeNext base from `packages/ts-config`.
No `dist/` is produced; `start` runs TypeScript through `tsx`.

## What is intentionally absent

- Coverage thresholds. `@vitest/coverage-v8` is not installed, so
  `vitest --coverage` is not part of the gate.
- Broad repository integration tests (nodes/edges/proposals, AGE/pgvector,
  transaction rollback, stream publication); only the auth flow is integrated.
- Integration tests in CI. They currently require a developer-managed
  docker-compose pair; Testcontainers or service containers are Phase 4.
- End-to-end tests (Playwright) for the PWA. The dependency is installed
  (`@playwright/test` in `apps/web`) but no spec exists yet — roadmap 3.7.
- Load/performance tests (k6) and the 10,000-node / 50,000-edge stress seed.
- Python tests in Turbo. The runtime suite runs in CI (`uv run pytest`) and
  locally, but it is not part of the Turbo task graph.
- Worker handler and end-to-end pipeline tests: the three workers are covered
  by unit tests and by manual end-to-end runs, but the Consolidator does not
  exist and no test drives a live Ollama or a live Redis stream.
- Contract tests between Zod DTOs and Python/Pydantic models.
- Mutation, accessibility, visual-regression and PWA offline tests.
- A `test:ci` package script. `turbo.json` declares the task, but no package
  implements it, so `pnpm turbo run test:ci` is currently a no-op.

CI runs three jobs: the TypeScript gate (`pnpm turbo run build type-check
test`), the Python gate (`uv sync --frozen`, `uv run pytest`, ruff check and
format) and the worker image builds. It does not run the integration suite,
E2E, coverage or deployments.

## Known lint debt

`pnpm lint` is **red** with 24 pre-existing `@typescript-eslint/no-explicit-any`
errors. This is tracked debt, not a passing gate. CI deliberately omits lint
until the errors are fixed; do not describe the repository as fully green on
lint. Build, type-check and unit tests are green.

## Phase 4 plan (not implemented)

| Level | Tooling | Scope | Acceptance target |
| --- | --- | --- | --- |
| Unit | Vitest + in-memory fakes | Domain, use cases, validation | Coverage > 85% in `domain/` and `application/`; invalid transitions assert domain errors |
| Integration | Vitest + ephemeral Postgres 18/AGE/pgvector (Testcontainers or the repo image) + Redis 7 | Auth suite exists against local Compose; broaden to Drizzle repos, `UnitOfWork` rollback, tenant isolation, stream publication and HNSW queries | Rollback verified on throw; workspace isolation enforced; HNSW p95 < 20 ms over 100k vectors (NFR-02) |
| Contract | Zod ↔ Pydantic fixtures | Extractor/Relator/Consolidator payloads | Shared fixtures for `RawSourceRecord`, node creation and proposals |
| E2E | Playwright against API + PWA + seeded DB | Login/mint → create node → suggest edge → approve | Critical flow completes with no browser console errors |
| Load | k6 + `db:seed:stress` | Subgraph reads, mutations, votes, HNSW | Subgraph (<200 nodes) p95 < 30 ms (NFR-01); mutations p95 < 15 ms (NFR-03) |
| Resilience | Fault injection | Redis/Ollama unavailable | API stays available; AI work remains queued (NFR-10) |
| CI | GitHub Actions | All of the above | Merge blocked on any failure; see [ci-cd.md](spec/ci-cd.md) |

Integration tests must build or pull the repository's
`vozlab/postgres:18-age-pgvector` image. Do not substitute a stock
`postgres:16` or a stale `ankane/pgvector` image; migrations use
`vector(768)` and AGE.

## Related

- [conventions.md](conventions.md) — NodeNext imports and layering rules.
- [runbook-dev.md](runbook-dev.md) — local commands.
- [requirements.md](requirements.md) — FR/NFR sources.
