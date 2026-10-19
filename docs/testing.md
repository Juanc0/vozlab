# Testing Strategy

Current automated tests are **unit tests only**. This page records what is
green today, what is deliberately missing, and the Phase 4 plan.

## Current suite

| Item | Value |
| --- | --- |
| Runner | Vitest 2.1.9 |
| Location | `apps/api/tests/**/*.test.ts` |
| Size | 24 files / 114 tests |
| Scope | Domain entities, value objects, use cases, auth/OIDC adapters, pure infrastructure helpers |
| Isolation | In-memory fakes; no PostgreSQL, Redis, HTTP or Ollama |
| Coverage | Not measured; no coverage provider installed |

The suite uses `tests/support/fakes.ts`, `tests/support/authFakes.ts` and
`tests/support/hash.ts` to exercise use cases without adapters.
`apps/api/vitest.config.ts` adds a Vite plugin that resolves NodeNext `./x.js`
specifiers to `./x.ts` sources, so tests can import application code unchanged.
A setup file (`tests/setup/env.ts`) fills the required environment variables;
`LOG_LEVEL=fatal` keeps expected negative-path logs out of the output.

Covered areas include node/edge/proposal state machines, authorization rules,
vote casting, thread closure, keyset pagination, timestamp ownership, the
connection pool manager, `AuthorHash` validation, PKCE/state construction,
OIDC ID-token verification (locally generated JWKS, nonce/audience/issuer
failures), JWT claim issuance, refresh rotation/reuse, logout, JIT user upsert,
`/auth/me`, event-code joins, and token/duration utilities. All network calls
use injected `fetch`; no IdP, PostgreSQL or Redis is contacted.

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
- Integration tests against real PostgreSQL/AGE/pgvector or Redis.
- End-to-end tests (Playwright) for the PWA.
- Load/performance tests (k6) and the 10,000-node / 50,000-edge stress seed.
- Python worker tests; the workers do not exist yet.
- Contract tests between Zod DTOs and Python/Pydantic models.
- Mutation, accessibility, visual-regression and PWA offline tests.
- A `test:ci` package script. `turbo.json` declares the task, but no package
  implements it, so `pnpm turbo run test:ci` is currently a no-op.

CI runs `pnpm turbo run build type-check test` and nothing else. It does not run
integration, E2E, coverage, Docker builds or deployments.

## Known lint debt

`pnpm lint` is **red** with 26 pre-existing `@typescript-eslint/no-explicit-any`
errors. This is tracked debt, not a passing gate. CI deliberately omits lint
until the errors are fixed; do not describe the repository as fully green on
lint. Build, type-check and unit tests are green.

## Phase 4 plan (not implemented)

| Level | Tooling | Scope | Acceptance target |
| --- | --- | --- | --- |
| Unit | Vitest + in-memory fakes | Domain, use cases, validation | Coverage > 85% in `domain/` and `application/`; invalid transitions assert domain errors |
| Integration | Vitest + ephemeral Postgres 18/AGE/pgvector (Testcontainers or the repo image) + Redis 7 | Drizzle repos, `UnitOfWork` rollback, tenant isolation, stream publication, HNSW queries | Rollback verified on throw; workspace isolation enforced; HNSW p95 < 20 ms over 100k vectors (NFR-02) |
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
