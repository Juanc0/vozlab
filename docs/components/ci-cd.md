# CI/CD

> STATUS: **PARTIAL — living doc** (migrated from `docs/spec/` 2026-10-29).
> The "current" section describes `.github/workflows/` as committed; the remote
> is `github.com/Juanc0/vozlab` and Actions have been green on `main` since
> run 5 (2026-10-30, `176731a`) — runs 1–4 were the first-ever executions and
> fixed real defects (setup-uv full-tag pin, fixtures that drifted against
> the fresh fold, `ruff format`).

## Current pipeline (as committed, 2026-10-29)

`.github/workflows/` contains three files; `ci.yml` runs on pull requests and
pushes to `main`; a concurrency group cancels superseded runs. It has
**four jobs**.

| Job | Steps |
| --- | --- |
| `verify` (TypeScript) | checkout → `pnpm/action-setup@v4` (version from `packageManager`) → `setup-node@v4` (Node 22, pnpm cache) → `pnpm install --frozen-lockfile` → `pnpm turbo run build type-check test` → per-package coverage runs with thresholds enforced by the vitest config → `pnpm lint` (warnings allowed; **errors fail**) |
| `integration` | ephemeral Postgres 18 (`pgvector/pgvector:pg18` — no `age`: no fold creates a graph since the baseline collapse, so the missing extension never bites; dev keeps its `vozlab/postgres:18-age-pgvector` image) + Redis 7 services; provisions router + tenant databases, runs `CREATE EXTENSION IF NOT EXISTS vector` on both (the tenant baseline fold creates a `vector(768)` column and an `hnsw` index and would fail on vanilla Postgres — the extension must pre-exist the fold), then migrations, seed and the integration suite |
| `python` (worker runtime) | `astral-sh/setup-uv@v10` → `uv sync --frozen` → `uv run pytest` → `ruff check` → `ruff format --check` |
| `images` | `docker build` of the embedder, Relator, Extractor **and the API and web** images (not pushed anywhere) |

Companion workflows (manual, valid YAML since 2026-10-29 — before that they
carried literal `EOF`/`echo created` artifacts that made them unloadable):

- `e2e.yml`: Playwright against API + PWA + seeded stack (`workflow_dispatch`
  + push to `main`). Never executed (no remote).
- `deploy.yml`: manual `workflow_dispatch`; the deploy job is fully commented
  out pending a real host — the T2 procedure today is `docs/ops/production-deployment.md`.

The unit gate is `build type-check test` (≈352 API tests, ≈521 web tests).
`pnpm lint` passes with 0 errors / ~35 warnings (the `no-explicit-any` debt
was paid 2026-10-29).

What it does **not** do:

- No registry push, SBOM or vulnerability scan; the image job only proves the
  Dockerfiles build.
- No nightly/load (k6) trigger; the k6 smoke script exists (`scripts/load/`).
- No `develop` branch trigger (it does not exist).
- Execution history lives on GitHub Actions: CI green on `main` since run 5
  (2026-10-30). E2E remains `workflow_dispatch`-only until task 13.

Do not paste the stale pipeline from the old DevOps spec: it used Node 20,
pnpm 9, a `develop` branch, an `ankane/pgvector:...postgres16` service and
`test:ci`. None of that matches this repository.

## Planned full pipeline (not implemented)

Everything below is Phase 4 work. Jobs should run in parallel where possible and
share the pnpm store cache.

| Job | Trigger | Contents |
| --- | --- | --- |
| `verify` | PR + main | Install, build, type-check, unit tests. Add lint once debt is paid. Add `format --check`. |
| `integration` | PR + main | Ephemeral Postgres 18 + AGE + pgvector, Redis 7, router + tenant migrations, seed, integration tests. |
| `contract` | PR + main | Zod ↔ Pydantic fixtures for Extractor/Relator/Consolidator payloads. |
| `e2e` | PR + main | Playwright against API + PWA + seeded DB; browsers cached. |
| `coverage` | PR + main | Vitest coverage, upload artifact; fail below 85% in `domain/` + `application/`. |
| `images` | main + tags | Build API/web/worker images with Buildx, SBOM, scan, push to GHCR. |
| `load` | nightly / manual | k6 against a seeded 10k-node / 50k-edge environment. |
| `deploy` | main after gates | Run migrations as a one-shot job, then deploy the API/web/workers. |

### Ephemeral PostgreSQL

The tests need the **repository image**, not stock Postgres:

```bash
docker build -t vozlab/postgres:18-age-pgvector docker/postgres
```

Options:

1. **Testcontainers** (preferred): the test setup builds/starts the image,
   mounts `packages/database/scripts` into `/docker-entrypoint-initdb.d`, and
   waits for readiness.
2. **Docker in the CI job**: `docker run` the image with the init scripts
   mounted, then run migrations and tests against `localhost:5432`.
3. **Prebuilt GHCR image**: build and publish
   `ghcr.io/<org>/vozlab-postgres:<tag>` from `main`, then use it as a GitHub
   Actions `services` image. GitHub `services` cannot build a local Dockerfile,
   so a published image is required for that route.

Redis 7 can run as a normal `services: redis:7-alpine` container. The initdb
scripts create `vozlab_router` and `vozlab_tenant_dev`; they only run on a fresh
volume, which is exactly what an ephemeral job provides.

Run both migration targets before integration tests:

```bash
pnpm --filter @vozlab/database db:migrate:router
pnpm --filter @vozlab/database db:migrate:tenant
pnpm --filter @vozlab/database db:seed:dev
```

Never point CI at a shared database. Each job gets its own throwaway instance.

### End-to-end and load

- Playwright starts the API and web app against the seeded ephemeral DB. Stub
  Ollama with a deterministic HTTP fake; do not require a GPU or pull models in
  CI.
- k6 is nightly/manual only, with `db:seed:stress` (10k nodes / 50k edges).
  Targets: subgraph p95 < 30 ms (NFR-01), mutations p95 < 15 ms (NFR-03),
  HNSW p95 < 20 ms over 100k vectors (NFR-02).
- E2E covers login/mint → create node → suggest edge → approve, with no browser
  console errors.

### Images and deployment

- Build separate images for `apps/api`, `apps/web`, `worker-extractor`,
  `worker-relacionador` and `worker-consolidador` once the workers exist.
- Tag by commit SHA; push to GHCR with `GITHUB_TOKEN`.
- Run `db:migrate` as a dedicated job before rolling out the API. Migrations are
  not run by the API process itself.
- Deploy behind an environment protection rule; production uses orchestrator/
  secret-manager env, not a committed `.env`.

## Required secrets and services

| Name | Used by | Notes |
| --- | --- | --- |
| `JWT_SECRET` | API, integration, E2E | Generate per CI run; ≥ 32 chars; never reuse production. |
| `ROUTER_DB_*`, `TENANT_DB_*` | Migrations, integration | Point at the ephemeral instance. |
| `REDIS_HOST/PORT/PASSWORD` | API, workers, integration | Ephemeral Redis. |
| `OIDC_*`, `WEB_ORIGIN` | API boot | All URLs are required; use syntactically valid placeholders when no IdP is under test. Auth endpoints exist but are not exercised by the unit suite. |
| `CODECOV_TOKEN` (optional) | Coverage upload | Or use the GitHub-native uploader. |
| `GITHUB_TOKEN` | GHCR push | Built-in; grant `packages: write`. |
| Registry credentials | GHCR/other | Only if not using `GITHUB_TOKEN`. |
| Deploy credentials / kubeconfig | Deploy job | Environment-scoped, never in logs. |
| `OLLAMA_BASE_URL` | Workers/E2E | Point at a stub in CI. |

## Phase 4 acceptance criteria

- [ ] CI uses `actions/cache`/setup-node caching for pnpm.
- [ ] `turbo run build type-check test` plus lint (after debt) blocks merges.
- [ ] Integration tests use the PG18 + AGE + pgvector image and prove
  `UnitOfWork` rollback.
- [ ] Playwright covers the critical governance flow.
- [ ] k6 enforces the NFR latency targets.
- [ ] Coverage is reported and ≥ 85% for `domain/` + `application/`.
- [ ] Images build, scan and push; migrations run before deploy.

## Related

- [testing.md](../testing.md) — current suite and planned levels.
- [runbook-dev.md](../ops/runbook-dev.md) — local equivalents of the CI commands.
- [runbook-ops.md](../ops/runbook-ops.md) — current operational limits.
- [conventions.md](../conventions.md) — build/type-check layout.
