<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# VozLab — Agent Notes

Multi-tenant knowledge-graph platform: Fastify API + SvelteKit 5 PWA + Python 3.12
AI workers, backed by PostgreSQL 18 (Apache AGE + pgvector) and Redis Streams.
Code, comments and identifiers are English. The docs are the approved spec; when
they disagree with the code, **the code wins** — fix the doc.

## Layout
- `apps/api` — the API. Hexagonal: `domain/` (pure),
  `application/use_cases/`, `infrastructure/{http,persistence,events}/`, `shared/`.
- `apps/web` — SvelteKit 5 PWA (Svelte 5 runes, Tailwind 4, adapter-node).
  Phase 3 is complete: state layer, route groups, Cytoscape canvas, governance
  UI, admin UI (tenancy v5/v6), tenant selector, offline shell, i18n and a
  Playwright E2E suite. `docs/components/web-pwa.md` is the living component
  doc.
- `apps/worker-consolidador` — **does not exist yet** (FR-20 deferred; `docs/components/consolidator.md` is the design).
- `apps/worker-embedder` — Python 3.12/uv worker: consumes `NODE_CREATED`,
  calls Ollama (`nomic-embed-text`, 768 dims) and writes the vector through
  the agent-only `PUT /api/v1/nodes/:id/embedding` route.
- `apps/worker-relacionador` — Python 3.12/uv worker: consumes the same stream
  (group `relator`), reads the top-5 neighbours through
  `GET /api/v1/nodes/:id/neighbors`, asks the local LLM and creates a
  `PENDING` edge. A `MERGE` verdict becomes a merge proposal (ADR-0023/0026);
  approving it applies the merge.
- `apps/worker-extractor` — Python 3.12/uv worker: consumes `stream:source_raw`
  (group `extractor`), masks the PII locally, asks the local LLM for a draft
  and creates a `PENDING` node. Nothing publishes that stream yet.
- `packages/worker-shared` — shared Python runtime (`vozlab_worker`): settings,
  JSON logs, agent tokens, httpx client, Redis Streams consumer groups,
  `XAUTOCLAIM`, retries and DLQ.
- `packages/database` — Drizzle schemas + migrations (router and tenant);
  `packages/shared-types` — Zod DTOs + `ERROR_CODES`; `packages/ts-config`.
- Docs entry point: `docs/README.md` (structure + lifecycle rules there).
  Roadmap: `ROADMAP.md` (the single board). Decisions: `docs/decisions/`
  (ADRs, append-only). Per component: `docs/components/<x>.md` with a
  `STATUS:` banner (built = living doc, unbuilt = spec). Active work:
  `docs/plans/<area>/v<N>.md`. Deep not-yet-realized material:
  `docs/knowledge/`. Runbooks: `docs/ops/`. Records of open interventions:
  `docs/analysis/`. The cemetery for finished process docs: `docs/archive/`.

## Commands (pnpm only)
- `pnpm install` — workspace install.
- `pnpm turbo run build` — `tsc --noEmit` for every TS package (no JS emitted).
- `pnpm type-check` — build + type-check tests and DB scripts (see below).
- `pnpm test` — Turbo test task; `pnpm --filter @vozlab/api test` for one package.
- `pnpm lint` — repo ESLint, enforced in CI (errors fail). 0 errors / ~35
  warnings since 2026-10-29 (the `no-explicit-any` debt was paid).
- `uv sync` — Python 3.12 workspace environment from `uv.lock` (uses the
  repo-root `.venv`; keep it dedicated to this workspace).
- `uv run pytest` — 103 Python runtime/worker tests; `uv run ruff check
  packages/worker-shared apps/worker-embedder apps/worker-relacionador
  apps/worker-extractor` — Python lint.
- `uv run vozlab-worker-embedder --check` — validate the embedder config;
  `--once` runs a single pass over `stream:node_created`.
  `uv run vozlab-worker-relacionador --check` and
  `uv run vozlab-worker-extractor --check` do the same for the other workers.
- `docker compose --profile workers up -d` — run the three workers as
  containers (the API stays on the host).
- `pnpm --filter @vozlab/api dev` — `tsx watch` with `--env-file-if-exists=../../.env`.
- `pnpm --filter @vozlab/web dev` — SvelteKit dev server on **5173** (the API's
  `WEB_ORIGIN` expects it); `build` emits an adapter-node server in
  `apps/web/build/`.
- `pnpm --filter @vozlab/database db:generate[:router|:tenant]`,
  `db:migrate[...]`, `db:push[...]`, `db:seed:dev`,
  `db:mint-token -- --as maintainer|moderator|member|agent`,
  `db:grant-mcp-reader` (dev-only read-only role for the Postgres MCP).
- **Postgres MCP** (`opencode.json` → `mcp.servers.postgres`): `crystaldba/postgres-mcp`
  in restricted mode as `mcp_reader`, pointed at `vozlab_tenant_dev` only. Read-only by
  design; `vozlab_router` and `auth.refresh_tokens` are unreachable. On a new machine or
  fresh clone, follow the 4 checks in `docs/agent-tooling.md` § *Verifying the setup*.
  Never point it at a production tenant.
- `docker compose up -d --build` — Postgres 18 (`vozlab/postgres:18-age-pgvector`),
  Redis 7, Ollama. Init SQL runs only on a fresh volume.
- `docker compose --profile idp up -d` — adds Zitadel (identity broker, replaces
  Keycloak) on `:8081`. Setup: `./scripts/setup-zitadel.sh`.
- `docker compose --profile observability up -d` — adds Prometheus (:9090),
  Grafana (:3001) and Tempo (:3200/:4317/:4318). API exposes `/metrics`.
- `docker compose -f docker/identity-lab/compose.yml up -d` — Keycloak (legacy,
  still available for SAML/LDAP testing).

## Hard-to-miss conventions
- **NodeNext**: every relative import in `.ts` ends in `.js` (`./server.js`),
  even though the source file is `.ts`. Applies to all packages.
- `domain/` must not import Fastify, Drizzle or `pg`. Dependencies are wired
  manually in the Composition Root (`infrastructure/http/server.ts` + `routes.ts`);
  no IoC container.
- **Two physical DBs, never mixed**: router `vozlab_router` (`public.tenants`,
  `tenant_connections`) and one DB per tenant (`vozlab_tenant_dev`; schemas
  `auth`, `meta`, `public`, `social`). Separate drizzle configs/migrations.
- Isolation is physical: repositories take `tid` (internal tenant UUID);
  `UnitOfWork.runInTransaction(tid, cb)` shares the `tx` handle.
- Protected requests need `Authorization: Bearer <jwt>` **and** an
  `X-Workspace-ID` UUID. Guard order: `authGuard -> tenantWorkspaceGuard -> rateLimit`.
- `author_hash` is an **opaque per-user pseudonym** stored on `auth.users` and
  carried as the JWT `authorHash` claim. There is no salt and the API never
  derives it ([ADR-0013](docs/decisions/ADR-0013-random-opaque-pseudonym.md)).
- Workspace mismatch returns **404**, never 403 (existence is not leaked).
- Timestamps: domain owns `created_at`/`updated_at`, adapters own `deleted_at`.
- Events are published **after commit, best-effort** (`stream:node_created`, …);
  a broker failure never rolls back persisted data.
- Env is Zod-validated at startup (`apps/api/src/shared/config/env.ts`); invalid
  config exits. Required: `ROUTER_DB_*`, `REDIS_HOST`, `JWT_SECRET` (≥32 chars),
  all `OIDC_*` URLs. No `.env` is committed.

## Current state / gotchas (verified 2026-10-29)
- Phase 0/1/1R/1S/1T/3 done; the auth/onboarding v5+v6 intervention is closed
  on code (`docs/analysis/auth-onboarding-committee-review.md`). ~352 API +
  ~521 web unit tests, 105 Python worker tests, real Zitadel login E2E
  verified. E2E Playwright: 17 green / 1 opt-in (`E2E_OIDC=1`) / 14 red =
  graph-suite realignment (task 13, ROADMAP).
- `GET /api/v1/ingestion/resolve-source` is the one protected route without
  `X-Workspace-ID` (the workspace is the answer); it is agent-only and
  tenant-scoped (ADR-0025).
- Phase 2 in progress: `packages/worker-shared`, `apps/worker-embedder` (FR-18),
  `apps/worker-relacionador` (FR-19) and `apps/worker-extractor`
  (FR-17, partial) are implemented, and the source registry + resolution route
  exist. The Consolidator handler and the ingestion producer are still missing.
- The proposal contract is a union on `kind` (`EDIT` | `MERGE`, ADR-0026). A
  merge proposal targets the node that is merged away and names the survivor
  in `proposedChanges.mergeIntoNodeId`; approving it applies the merge
  (duplicate → `MERGED`, survivor absorbs it, edges re-pointed).
- `build` type-checks `src/**`; `type-check` additionally covers
  `apps/api/tests/**` and `packages/database/scripts/**` via
  `tsconfig.tests.json` / `tsconfig.scripts.json`.
- CI: `ci.yml` has four jobs (verify + coverage + lint, integration with
  Postgres/Redis services, python, image builds incl. api/web); manual
  `e2e.yml` + `deploy.yml`. The remote is `github.com/Juanc0/vozlab` (SSH for
  push/pull); **CI has been green since run 5 (2026-10-30, `176731a`)** — the
  first-ever Actions executions (runs 1-4) surfaced and fixed real defects
  (setup-uv pin, fixture drift vs the fresh fold, ruff format).
  Production topology T2 (Caddy, three origins) is instrumented per ADR-0043:
  `docker-compose.prod.yml`, `deploy/caddy/Caddyfile`,
  `docs/ops/production-deployment.md`. The API trusts `X-Forwarded-*` from
  loopback/RFC1918 CIDRs (`infrastructure/http/proxyTrust.ts`).
- Not built: the Consolidator handler, an ingestion producer for
  `stream:source_raw`, a management route for `meta.data_sources`, SSE, AGE
  adapter, backfill of existing nodes, a real deployment (T2 is ready pending
  the hostname). Workers run via the `workers` compose profile / host
  processes; they are not deployed either.
- **Redis port conflict (fixed 2026-10-26):** `docker/identity-lab/compose.yml`
  used to publish its own `redis` on `127.0.0.1:6379`, colliding with
  `vozlab-redis` from the main compose. Keycloak does not need redis, so the
  service was removed. The API (`REDIS_HOST`) must always point at the main
  compose's redis on 6379; never run two redis instances on that port. If
  OIDC login surfaces `ERR_INVALID_OIDC_STATE`, check
  `docker ps | grep redis` and `ss -tlnp | grep 6379` first.
- **Dev servers are host processes, not containers:** the main compose does
  *not* start the API or the web. Always run
  `pnpm --filter @vozlab/api dev` and `pnpm --filter @vozlab/web dev` on the
  host; the API's `WEB_ORIGIN` expects the web on `:5173`. A missing web dev
  server makes the post-login redirect (`302` → `WEB_ORIGIN`) fail with
  `ERR_CONNECTION_REFUSED`.
- Installed pins: drizzle-orm 0.45, drizzle-kit 0.31, PostgreSQL 18. Trust
  `package.json` and `docker/`. Some archived docs describe older versions.
- `docker-compose.yml` mounts `packages/database/scripts/` as initdb scripts;
  they run only on a fresh volume.
- `.gitignore` covers `node_modules`, `.turbo`, `dist`, `build`, `coverage`,
  `.env`, `.venv`. Not every artifact is ignored (check before committing).
- `turbo.json` has `outputs: []` for `build`/`lint`/`type-check`/`test` (no JS or
  coverage emitted today). Keep the Turbo managed block above untouched.
- Repo ships curated agent skills under `.agents/skills/`, tracked by
  `skills-lock.json`.

## Working conventions
- Act as a senior engineering committee. When requirements are ambiguous, stop
  and ask with structured options + trade-offs before coding; change one
  component at a time.
- `ROADMAP.md` is the only live task board. Completed work is archived — do not
  re-open `TODO.md` or `EXECUTION_PLAN.md`.
- `/next-task` (`.opencode/commands/next-task.md`): take the next open item,
  implement it, run `pnpm turbo run build type-check test`, mark it `[x]` with a
  one-line result, and update `docs/README.md` if a requirement changed.
- `/review-arch` (`.opencode/commands/review-arch.md`): audit code vs `docs/` vs
  `ROADMAP.md` and report gaps.
- `/new-plan`, `/close-plan`, `/docs-hygiene` (`.opencode/commands/`): the plan
  lifecycle (open `docs/plans/<area>/vN.md` → archive on closure) and the
  documentation gate (`bash scripts/docs-hygiene.sh`, also a CI step).
- Document lifecycle: active work lives in `docs/plans/<area>/v<N>.md`; on
  closure its evidence must already be in `docs/components/` + ADRs, its
  unfinished slivers move forward with an origin citation, and the plan file
  goes to `docs/archive/plans/`. Never leave completed task prompts or status
  notes in the living docs.
