# VozLab

VozLab is a multi-tenant knowledge-graph platform for institutional co-creation. Community members turn scattered listening inputs (surveys, suggestion boxes, meeting minutes) into typed graph nodes, debate them in threads, and propose edits through a pull-request-style governance flow. Each institution gets its own physical PostgreSQL database; each workspace is isolated inside it.

The platform is specified as a Fastify API plus a SvelteKit 5 PWA, three Python AI workers, and a dedicated embedding worker. **Only the API is implemented today; the Phase 2 Python worker runtime exists as a scaffold.**

## Status

| Area | State |
| --- | --- |
| API core (nodes, edges, proposals, ontology, discussions, votes) | Done — Phases 0/1/1R/1S/1T, 45 tasks verified |
| Auth flow (OIDC login/callback, refresh/logout, `/auth/me`, event QR join) | Done — Batch 1V; requires a configured IdP |
| Tests | 24 files / 114 TypeScript unit tests green (`pnpm test`); opt-in auth integration suite (5 tests); Python runtime 37 tests (`uv run pytest`) |
| Build / type-check | Green (`pnpm turbo run build type-check`) |
| CI | Thin GitHub Actions: install + `build type-check test` (TypeScript only; Python tests are not wired yet) |
| Lint | **Red debt** — 26 pre-existing `@typescript-eslint/no-explicit-any` errors |
| Python workers | Shared `vozlab_worker` runtime + embedder scaffold; no handler consumes events yet |
| PWA, Apache AGE adapter, embeddings, SSE, metrics | Not built; `nodes.embedding` stays `NULL` |

The API now implements the real auth flow. No IdP runs in Compose and the PWA login screen is Phase 3, so local development still uses `db:mint-token`; see [docs/README.md](docs/README.md) for the requirement-by-requirement status.

## Repository layout

| Path | Contents | State |
| --- | --- | --- |
| `apps/api` | Fastify API (hexagonal: `domain`, `application`, `infrastructure`, `shared`) | Implemented |
| `apps/web` | SvelteKit 5 PWA | Empty scaffold (Phase 3) |
| `apps/worker-extractor` | Python 3.12 ingestion worker | Empty scaffold (Phase 2) |
| `apps/worker-relacionador` | Python 3.12 relationship evaluator | Empty scaffold (Phase 2) |
| `apps/worker-consolidador` | Python 3.12 opportunity consolidator | Empty scaffold (Phase 2) |
| `apps/worker-embedder` | Dedicated `NODE_CREATED` embedding worker (ADR-0020) | Python package + `--check`; handler is Phase 2.4 |
| `packages/worker-shared` | Shared Python runtime: config, JSON logs, agent tokens, HTTP client, Redis Streams consumer | Implemented and tested |
| `packages/database` | Drizzle schemas, migrations, dev seed/token/event-code scripts | Implemented |
| `packages/shared-types` | Zod DTOs, agent/role/ingestion contracts, `ERROR_CODES` | Implemented |
| `packages/ts-config` | Shared TypeScript configuration | Implemented |
| `docker/postgres` | Custom PostgreSQL 18.6 + Apache AGE 1.8 + pgvector image | Implemented |

## Quickstart (5 minutes)

Prerequisites: Node 22 (CI baseline), pnpm 12.11.2 (`corepack enable`), Docker with Compose. Python worker work additionally needs uv and Python 3.12.

```bash
pnpm install
cp .env.example .env
set -a; . ./.env; set +a   # drizzle-kit reads the process env, not the repo-root .env
docker compose up -d --build
pnpm --filter @vozlab/database db:migrate
pnpm --filter @vozlab/database db:seed:dev
pnpm --filter @vozlab/api dev
```

The API listens on `http://localhost:3000`. The dev seed is idempotent and provisions tenant `sabana`, workspace `general` (`33333333-3333-4333-8333-333333333333`), four identities, and a base ontology (`Problem`, `Idea`, `Resource`). The init scripts run only on a fresh Postgres volume.

In a second terminal, mint a token and call the API:

```bash
pnpm --filter @vozlab/database db:mint-token -- --as maintainer

TOKEN=$(pnpm --filter @vozlab/database db:mint-token -- --as maintainer \
  | grep -E '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')

curl -s http://localhost:3000/api/v1/nodes \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-ID: 33333333-3333-4333-8333-333333333333"
```

`--as` accepts `maintainer`, `moderator`, `member`, or `agent`. Replace `JWT_SECRET` in `.env` before sharing an environment; the example value is for local development only.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm turbo run build` | Type-checks every TypeScript package (`tsc --noEmit`); emits no JS |
| `pnpm type-check` | `turbo run build type-check` (tests and DB scripts included) |
| `pnpm test` | Runs the Vitest suites via Turbo |
| `pnpm lint` | ESLint — currently fails with 26 known `any` errors |
| `pnpm --filter @vozlab/api dev` | API with `tsx watch`, loading the repo-root `.env` |
| `pnpm --filter @vozlab/database db:migrate` | Applies router + tenant migrations |
| `pnpm --filter @vozlab/database db:seed:dev` | Idempotent dev tenant/workspace/ontology seed |
| `pnpm --filter @vozlab/database db:mint-token -- --as <name>` | Mints a 12 h HS256 dev JWT |
| `pnpm --filter @vozlab/database db:event-code -- --workspace <uuid>` | Creates a global event code for QR join; prints the raw code once |
| `pnpm --filter @vozlab/database db:generate` | Generates Drizzle migrations for both databases |
| `pnpm format` | Prettier over TS/TSX/JSON/Markdown |
| `uv sync` | Creates the Python 3.12 workspace environment from `uv.lock` |
| `uv run pytest` | Runs the shared worker runtime and embedder scaffold tests (37) |
| `uv run ruff check packages/worker-shared apps/worker-embedder` | Lints the Python worker code |
| `uv run vozlab-worker-embedder --check` | Validates the embedder scaffold configuration and agent credential source |

The API `start` script runs `tsx` against `src/index.ts`; `build` is type-check-only, so there is no `dist/` to run.

## Documentation

| Document | Purpose |
| --- | --- |
| [docs/README.md](docs/README.md) | Documentation index and FR/NFR status matrix |
| [docs/architecture.md](docs/architecture.md) | Context, request path, two-DB topology, runtime facts |
| [docs/auth-and-tenancy.md](docs/auth-and-tenancy.md) | OIDC flow, access/refresh sessions, guards, workspace isolation, pseudonymity |
| [docs/api-reference.md](docs/api-reference.md) | Endpoints, headers, payloads |
| [docs/runbook-dev.md](docs/runbook-dev.md) | Local setup and troubleshooting |
| [ROADMAP.md](ROADMAP.md) | Phases, deferred work, known gaps |

## License

No `LICENSE` file is present. The repository is unlicensed by default; treat it as proprietary/internal until a license is added.
