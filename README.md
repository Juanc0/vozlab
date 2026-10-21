# VozLab

VozLab is a multi-tenant knowledge-graph platform for institutional co-creation. Community members turn scattered listening inputs (surveys, suggestion boxes, meeting minutes) into typed graph nodes, debate them in threads, and propose edits through a pull-request-style governance flow. Each institution gets its own physical PostgreSQL database; each workspace is isolated inside it.

The platform is specified as a Fastify API plus a SvelteKit 5 PWA, three Python AI workers, and a dedicated embedding worker. **The API and the Phase 2 Python worker runtime are implemented; the PWA has just started (roadmap 3.1).**

## Status

| Area | State |
| --- | --- |
| API core (nodes, edges, proposals, ontology, discussions, votes) | Done — Phases 0/1/1R/1S/1T, 45 tasks verified |
| Auth flow (OIDC login/callback, refresh/logout, `/auth/me`, event QR join) | Done — Batch 1V; requires a configured IdP |
| Tests | 35 API files / 195 TypeScript unit tests + 59 web files / 496 tests green (`pnpm test`); opt-in Playwright suite of 10 tests (`pnpm --filter @vozlab/web test:e2e`); opt-in integration suite (5 files / 29 tests); Python runtime 105 tests (`uv run pytest`) |
| Build / type-check | Green (`pnpm turbo run build type-check`) |
| CI | Thin GitHub Actions: TypeScript gate + Python gate (uv/pytest/ruff) + worker image builds |
| Lint | **Red debt** — 24 pre-existing `@typescript-eslint/no-explicit-any` errors |
| Embedding pipeline | Done — `NODE_CREATED` → Ollama (768) → `nodes.embedding` via the agent-only API route; the worker is not in Compose/CI yet |
| Relator (Agent 2) | Partial — reads the top-5 neighbours, asks the LLM and creates `PENDING` edges; a merge verdict is logged, not applied |
| Source registry | Done — `meta.data_sources` + agent-only `GET /api/v1/ingestion/resolve-source`; no management route yet |
| Extractor (Agent 1) | Partial — masks PII, extracts a draft and creates a `PENDING` node; nothing publishes `stream:source_raw` yet |
| Consolidator, AGE adapter, SSE, metrics | Not built |
| PWA (SvelteKit 5) | Working — builds, serves SSR, ships a manifest and a service worker (3.1), with the per-tab workspace state and the HTTP client (3.2), the route groups with the session guard (3.3), the Cytoscape canvas (3.4), the creation forms and the governance UI (proposal review, discussions, optimistic voting) (3.5), the offline shell with its accessibility pass (3.6), the Playwright suite (3.7), the interface in Spanish and English (3.10), the exploration view (3.12), the inspector (3.13) and the responsive layout (3.14) |

The API now implements the real auth flow. No IdP runs in Compose and the PWA login screen is Phase 3, so local development still uses `db:mint-token`; see [docs/README.md](docs/README.md) for the requirement-by-requirement status.

## Repository layout

| Path | Contents | State |
| --- | --- | --- |
| `apps/api` | Fastify API (hexagonal: `domain`, `application`, `infrastructure`, `shared`) | Implemented |
| `apps/web` | SvelteKit 5 PWA | Scaffold (Phase 3, 3.1 done) |
| `apps/worker-extractor` | Python 3.12 ingestion worker | Implemented (PII masking → LLM draft → `PENDING` node); the ingestion producer is missing |
| `apps/worker-relacionador` | Python 3.12 relationship evaluator | Implemented (neighbours → LLM → `PENDING` edge); merges deferred |
| `apps/worker-consolidador` | Python 3.12 opportunity consolidator | Empty scaffold (Phase 2) |
| `apps/worker-embedder` | Dedicated `NODE_CREATED` embedding worker (ADR-0020) | Implemented (Ollama → agent-only API write-back); not in Compose/CI yet |
| `packages/worker-shared` | Shared Python runtime: config, JSON logs, agent tokens, HTTP client, Redis Streams consumer | Implemented and tested |
| `packages/database` | Drizzle schemas, migrations, dev seed/token/event-code scripts | Implemented |
| `meta.data_sources` | API-owned `sourceId -> workspace` registry (ADR-0009) | Implemented (no management route) |
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

The API listens on `http://localhost:3000`. The dev seed is idempotent and provisions tenant `sabana`, workspace `general` (`33333333-3333-4333-8333-333333333333`), five identities, a base ontology (`Problem`, `Idea`, `Resource`) and one example data source. The init scripts run only on a fresh Postgres volume.

In a second terminal, mint a token and call the API:

```bash
pnpm --filter @vozlab/database db:mint-token -- --as maintainer

TOKEN=$(pnpm --filter @vozlab/database db:mint-token -- --as maintainer \
  | grep -E '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')

curl -s http://localhost:3000/api/v1/nodes \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-ID: 33333333-3333-4333-8333-333333333333"
```

`--as` accepts `maintainer`, `moderator`, `member`, `agent`, or `embedder`. Replace `JWT_SECRET` in `.env` before sharing an environment; the example value is for local development only.

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
| `uv run pytest` | Runs the shared worker runtime, embedder, Relator and Extractor tests (105) |
| `uv run ruff check packages/worker-shared apps/worker-embedder apps/worker-relacionador apps/worker-extractor` | Lints the Python worker code |
| `uv run vozlab-worker-embedder --check` | Validates the embedder configuration and agent credential source |
| `uv run vozlab-worker-embedder [--once]` | Runs the embedder consumer (once = single pass) |
| `uv run vozlab-worker-relacionador [--once]` | Runs the Relator consumer |
| `uv run vozlab-worker-extractor [--once]` | Runs the Extractor consumer |
| `docker compose --profile workers up -d` | Runs the three workers as containers (the API stays on the host) |

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
