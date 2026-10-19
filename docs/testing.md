# Testing Strategy

Current automated tests are **TypeScript unit tests by default, an opt-in auth
integration suite, and a Python worker-runtime suite**. This page records what
is green today, what is deliberately missing, and the Phase 4 plan.

## Current suites

| Item | Unit suite | Integration suite |
| --- | --- | --- |
| Runner | Vitest 2.1.9 | Vitest 2.1.9 |
| Location | `apps/api/tests/**/*.test.ts` (excluding `integration/`) | `apps/api/tests/integration/**/*.test.ts` |
| Size | 25 files / 120 tests | 2 files / 12 tests |
| Scope | Domain entities, value objects, use cases, auth/OIDC adapters, embedding write-back, pure infrastructure helpers | Real HTTP auth flow, Drizzle/PostgreSQL persistence, Redis rotation/state, event-code join, agent-only embedding write-back |
| Isolation | In-memory fakes; no PostgreSQL, Redis, HTTP or Ollama | Local docker-compose PostgreSQL/Redis plus an in-process mock OIDC provider |
| Trigger | `pnpm test` (default, CI) | `pnpm --filter @vozlab/api test:integration` (manual/phase 4 CI) |
| Coverage | Not measured; no coverage provider installed | Not measured |

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

### Python worker runtime

The Phase 2 runtime has **51 Python tests** in
`packages/worker-shared/tests` and `apps/worker-embedder/tests`. They cover
environment validation, JSON logging and correlation context, agent-token
minting/static/file/dev providers, the `httpx` API client (auth/workspace/
correlation headers, typed errors, opt-in 5xx retries), retry backoff, the
Redis Streams consumer (`XREADGROUP`, idempotent group creation, `XAUTOCLAIM`,
delivery-count-based dead-lettering and `PermanentError`), the Ollama client
(current and legacy endpoints, dimension checks, retryable vs permanent
failures) and the `NODE_CREATED` handler (read node → embed → write back, plus
the permanent/retryable classification). Redis is simulated with `fakeredis`;
HTTP with `httpx.MockTransport`. No live Redis, Ollama, API or IdP is
contacted. The embedder app test drives a full `--once` pass over a fake
stream.

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
- End-to-end tests (Playwright) for the PWA.
- Load/performance tests (k6) and the 10,000-node / 50,000-edge stress seed.
- Python tests in CI/Turbo. The runtime suite runs locally (`uv run pytest`),
  but CI does not install uv or run it yet; that is Phase 2.7.
- Worker handler and end-to-end pipeline tests: the embedder is covered by
  unit tests and by a manual end-to-end run, but no Extractor/Relator/
  Consolidator handler exists and no test drives a live Ollama or a live
  Redis stream.
- Contract tests between Zod DTOs and Python/Pydantic models.
- Mutation, accessibility, visual-regression and PWA offline tests.
- A `test:ci` package script. `turbo.json` declares the task, but no package
  implements it, so `pnpm turbo run test:ci` is currently a no-op.

CI runs `pnpm turbo run build type-check test` and nothing else. It runs the
TypeScript unit suite only; it does not run integration, Python, E2E, coverage,
Docker builds or deployments.

## Known lint debt

`pnpm lint` is **red** with 26 pre-existing `@typescript-eslint/no-explicit-any`
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
