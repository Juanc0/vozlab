# VozLab

[![CI](https://github.com/Juanc0/vozlab/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Juanc0/vozlab/actions/workflows/ci.yml?query=branch%3Amain)

VozLab is a multi-tenant knowledge-graph platform for institutional co-creation. Community members turn scattered listening inputs (surveys, suggestion boxes, meeting minutes) into typed graph nodes, debate them in threads, and propose edits through a pull-request-style governance flow. Each institution gets its own **physical** PostgreSQL database; each workspace is isolated inside it. The platform is a Fastify API (hexagonal), a SvelteKit 5 PWA, and three Python 3.12 AI workers, backed by PostgreSQL 18 (Apache AGE + pgvector) and Redis Streams.

The docs are the approved spec; when they disagree with the code, **the code wins** — fix the doc. This README describes the repository as it exists on 2026-10-30.

## Architecture at a glance

| Component | What it is | Detail |
| --- | --- | --- |
| `apps/api` | Modular-monolith Fastify API. Owns tenant resolution, authorization, all graph mutations and event publication. Hexagonal: `domain/` (pure — no Fastify/Drizzle/`pg`), `application/use_cases/`, `infrastructure/{http,persistence,events}/`, wired manually in the composition root (`server.ts` + `routes.ts`), no IoC container. TypeScript NodeNext: every relative import ends in `.js`. | [docs/architecture.md](docs/architecture.md), [docs/conventions.md](docs/conventions.md) |
| `apps/web` | SvelteKit 5 PWA — runes, Tailwind 4, adapter-node, dev server on **:5173**. Cytoscape canvas, governance UI, admin UI, offline shell, i18n (es/en). Phase 3 is complete. | [docs/components/web-pwa.md](docs/components/web-pwa.md) |
| `apps/worker-embedder` | Python 3.12/uv. Consumes `stream:node_created`, asks Ollama (`nomic-embed-text`, 768 dims) and writes the vector back through the agent-only `PUT /api/v1/nodes/:id/embedding`. Never touches tenant PostgreSQL. | [README](apps/worker-embedder/README.md), [ADR-0020](docs/decisions/ADR-0020-dedicated-embedding-pipeline.md) |
| `apps/worker-relacionador` | Consumes the same stream (group `relator`), reads the top-5 neighbours via `GET /api/v1/nodes/:id/neighbors`, asks the local LLM and creates a `PENDING` edge. A `MERGE` verdict becomes a merge proposal; approving it applies the merge. | [docs/components/relator.md](docs/components/relator.md), [ADR-0022](docs/decisions/ADR-0022-relator-neighbour-lookup.md), [ADR-0026](docs/decisions/ADR-0026-merge-contract.md) |
| `apps/worker-extractor` | Consumes `stream:source_raw` (group `extractor`), masks PII locally, asks the LLM for a draft and creates a `PENDING` node. Nothing publishes that stream yet — the ingestion producer is missing. | [docs/components/extractor.md](docs/components/extractor.md) |
| `packages/worker-shared` | The shared Python runtime (`vozlab_worker`): pydantic settings, JSON logs with `x-correlation-id`, agent JWT providers, httpx client, Redis Streams consumer groups with `XAUTOCLAIM`, retries and a dead-letter stream. | [README](packages/worker-shared/README.md), [ADR-0021](docs/decisions/ADR-0021-python-worker-runtime.md) |

`apps/worker-consolidador` **does not exist yet** (FR-20, deferred for MVP); [docs/components/consolidator.md](docs/components/consolidator.md) is the normative spec.

### Data and identity model

- **Two physical databases, never mixed** ([ADR-0002](docs/decisions/ADR-0002-two-physical-databases.md)). Router `vozlab_router`: `public.tenants`, `tenant_connections`, plus the cross-tenant registries added by later ADRs — `event_codes` (ADR-0019), and the identity tables `global_users`, `global_user_tenants`, `global_invitations`, `global_user_events` ([ADR-0042](docs/decisions/ADR-0042-cross-tenant-identity-and-explicit-tenant.md), coherent vocabulary per [ADR-0044](docs/decisions/ADR-0044-identity-vocabulary-coherence-and-migration-baseline.md)). Each DB migrates from a single baseline fold (the 28 historical folds were collapsed on 2026-10-30; pre-baseline history lives in git — ADR-0044).
- **One database per tenant** (`vozlab_tenant_dev` in dev), schemas `auth`, `meta`, `public`, `social`. Isolation is physical: every repository method takes `tid` (internal tenant UUID); multi-table writes go through `UnitOfWork.runInTransaction(tid, cb)`.
- **Identity**: OIDC (authorization code + PKCE) through Zitadel as the broker (ADR-0030); tenant resolved from validated token claims (ADR-0031); per-tenant JIT users; explicit tenant selection for multi-institution identities (`select-tenant`/`switch-tenant`). Event QR join (`/auth/event-join`) creates an anonymous **GUEST** user. 15-min access JWT in memory + rotating `HttpOnly` refresh cookie (ADR-0018).
- **Pseudonymity**: `author_hash` is an opaque per-user random pseudonym carried as the JWT `authorHash` claim — no salt, the API never derives it ([ADR-0013](docs/decisions/ADR-0013-random-opaque-pseudonym.md)).
- **Requests**: protected routes need `Authorization: Bearer <jwt>` **and** `X-Workspace-ID`; guard order `authGuard → tenantWorkspaceGuard → rateLimit`. A cross-workspace resource reads as **404, never 403** ([ADR-0008](docs/decisions/ADR-0008-cross-workspace-404.md)). The one exception is the agent-only `GET /api/v1/ingestion/resolve-source` — the workspace *is* the answer (ADR-0025).
- **Events** are published after commit, best-effort (`stream:node_created`, …); a broker failure never rolls back persisted data.

## Repository layout

| Path | Contents |
| --- | --- |
| `apps/api` | Fastify API (hexagonal) + Dockerfile |
| `apps/web` | SvelteKit 5 PWA + Dockerfile |
| `apps/worker-{embedder,relacionador,extractor}` | Python 3.12 workers, one uv workspace member each + Dockerfile |
| `packages/worker-shared` | Shared Python worker runtime (`vozlab_worker`) |
| `packages/database` | Drizzle schemas, router + tenant migration folds, dev scripts (seed, token mint, event codes, MCP reader grant) |
| `packages/shared-types` | Zod DTOs, agent/role/ingestion contracts, `ERROR_CODES` |
| `packages/ts-config` | Shared TypeScript configuration |
| `docker/postgres` | Custom PostgreSQL 18 + Apache AGE + pgvector image (`vozlab/postgres:18-age-pgvector`) |
| `docker/{prometheus,grafana,tempo,floci,identity-lab}` | Observability stack, AWS emulation, legacy Keycloak lab |
| `deploy/caddy` | T2 production reverse-proxy config ([ADR-0043](docs/decisions/ADR-0043-production-topology-caddy-t2.md)) |
| `docs/` | Living docs, `components/`, `plans/`, `decisions/` (ADRs), `knowledge/`, `ops/`, `analysis/`, `archive/` — index in [docs/README.md](docs/README.md) |
| `scripts/` | `docs-hygiene.sh` (docs gate), `setup-zitadel.sh`, `demo.sh`, `load/k6-smoke.js` |
| `.opencode/`, `.agents/`, `skills-lock.json` | Agent definitions, slash commands, vendored skills (see [Agent tooling](#agent-tooling-opencode)) |

## Quick start

Prerequisites: **Node 22** (CI baseline), **pnpm 12.11.2** (`corepack enable`), Docker with Compose. Worker work additionally needs **uv** and Python 3.12.

```bash
pnpm install
cp .env.example .env                 # dev defaults are baked into the code; edit only to change them
docker compose up -d --build         # Postgres 18 (AGE+pgvector), Redis 7, Ollama
pnpm --filter @vozlab/database db:migrate    # router + tenant migrations
pnpm --filter @vozlab/database db:seed:dev   # idempotent: tenant `sabana`, workspaces
                                             # `general`/`community` + `Evento Demo`, 5 dev
                                             # identities, ontology (Problem/Idea/Resource),
                                             # one dev data source
pnpm --filter @vozlab/api dev        # http://localhost:3000
pnpm --filter @vozlab/web dev        # http://localhost:5173 (host process, not a container)
```

The init SQL under `packages/database/scripts/` runs only on a **fresh** Postgres volume; use `db:migrate` + `db:seed:dev` on existing ones.

**Real login (recommended):**

```bash
docker compose --profile idp up -d   # Zitadel on :8081 (first init writes a bootstrap PAT to .zitadel-bootstrap/)
./scripts/setup-zitadel.sh           # provisions the project, OIDC app and test user unattended
```

Then sign in through the web app; the API's `WEB_ORIGIN` expects the web dev server on `:5173`, and `OIDC_*` in `.env` points at `http://localhost:8081`. A missing web server makes the post-login redirect fail with `ERR_CONNECTION_REFUSED`.

**No-IdP dev path** — mint a token and call the API:

```bash
TOKEN=$(pnpm --filter @vozlab/database db:mint-token -- --as maintainer \
  | grep -E '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')

curl -s http://localhost:3000/api/v1/nodes \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-ID: 33333333-3333-4333-8333-333333333333"
```

`db:mint-token -- --as` takes `maintainer`, `moderator`, `member` or `agent` (seeded identities from `packages/database/scripts/dev-identities.ts`). `db:event-code -- --workspace <uuid>` creates a global event code for QR join; the raw code is printed once. Replace `JWT_SECRET` (≥32 chars) before sharing an environment. Env is Zod-validated at startup (`apps/api/src/shared/config/env.ts`) — invalid config exits.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm turbo run build type-check test` | **The local gate.** `build` runs `tsc --noEmit` per TS package (no JS emitted); `type-check` additionally covers `apps/api/tests/**` and `packages/database/scripts/**`; `test` runs Vitest |
| `pnpm lint` | Repo ESLint — 0 errors / 36 warnings as of 2026-10-30; errors fail CI |
| `pnpm format` | Prettier over TS/TSX/JSON/Markdown |
| `pnpm --filter @vozlab/api dev` | `tsx watch` with `--env-file-if-exists=../../.env` |
| `pnpm --filter @vozlab/web dev` | SvelteKit dev server on :5173; `build` emits an adapter-node server in `apps/web/build/` |
| `pnpm --filter @vozlab/database db:generate[:router\|:tenant]` | Generate Drizzle migrations (never hand-edit the fold) |
| `pnpm --filter @vozlab/database db:migrate[:router\|:tenant]` / `db:push[...]` | Apply / push schema to router and tenant DBs |
| `pnpm --filter @vozlab/database db:seed:dev` / `db:mint-token` / `db:event-code` | Dev seed, HS256 dev JWT, QR event codes |
| `pnpm --filter @vozlab/database db:grant-mcp-reader` | Provision the read-only `mcp_reader` role for the Postgres MCP |
| `pnpm --filter @vozlab/api test:integration` | Opt-in integration suite — needs live Postgres/Redis (see CI note) |
| `pnpm --filter @vozlab/web test:e2e` | Playwright E2E suite (brings its own API :3100 + built web :5174) |
| `uv sync` | Python 3.12 workspace env from `uv.lock` (repo-root `.venv`) |
| `uv run pytest` | Worker runtime + all three worker suites |
| `uv run ruff check packages/worker-shared apps/worker-{embedder,relacionador,extractor}` | Python lint; `ruff format` is its companion |
| `uv run vozlab-worker-{embedder,relacionador,extractor} --check` | Validate a worker's config and agent credentials |
| `uv run vozlab-worker-<name> [--once]` | Run a worker consumer; `--once` is a single pass over the stream |
| `docker compose --profile workers up -d` | The three workers as containers (the API stays on the host; workers reach it via `host.docker.internal:3000`) |
| `docker compose --profile idp up -d` | Add Zitadel (:8081) |
| `docker compose --profile observability up -d` | Add Prometheus :9090, Grafana :3001, Tempo :3200/:4317/:4318; the API exposes `/metrics` |
| `docker compose --profile app up -d` | Optional API+web containers (reuses host `.env`); dev normally runs them on the host |
| `bash scripts/docs-hygiene.sh` | The docs gate (links, heredoc artifacts, dead refs, process debris) — also a CI step |

## Testing & CI

Suites, counted on the current `main` (`176731a`, 2026-10-30): **51 files / 352 API unit tests**, **62 files / 521 web unit tests** (`pnpm test`), **105 Python tests** (`uv run pytest`). Layering and known gaps: [docs/testing.md](docs/testing.md).

`.github/workflows/ci.yml` runs on push to `main` and PRs, four jobs:

1. **verify** — `pnpm turbo run build type-check test`, per-package coverage (thresholds enforced by vitest), `pnpm lint`, `scripts/docs-hygiene.sh`.
2. **integration** — fresh `pgvector/pgvector:pg18` + `redis:7` service containers, `db:migrate:router`/`:tenant` + `db:seed:dev`, then `test:integration`. **This fresh fold is the authority**: local dev volumes can drift (documented data drift makes some integration tests fail locally while CI passes).
3. **python** — `uv sync --frozen` (the lockfile is the contract), `pytest`, `ruff check` + `ruff format --check`.
4. **images** — builds the embedder, Relator, API and web images.

CI has been green since run 5 (2026-10-30, `176731a`); runs 1–4 were the first-ever Actions executions and fixed real defects (setup-uv pin, fixture drift against fresh folds, `ruff format`).

**E2E** ([`.github/workflows/e2e.yml`](.github/workflows/e2e.yml)) is **manual-dispatch only by committee decision** until [ROADMAP](ROADMAP.md) task 13 closes: 17 Playwright journeys green, 1 opt-in (`E2E_OIDC=1`, real Zitadel login), 14 red pending the graph-suite realignment to the toolbar redesign. A push-triggered red would train everyone to ignore red. `deploy.yml` is likewise manual. The remote is `github.com/Juanc0/vozlab` (SSH for push/pull).

## Documentation & methodology

[docs/README.md](docs/README.md) is the hub — structure, lifecycle rules, the FR/NFR status matrix, and reading paths. The short version:

| Directory | Role |
| --- | --- |
| `docs/*.md` | Living reference — describes today's code only; edited in the same commit as the code |
| `docs/components/` | Per-component docs with `STATUS:` banners (BUILT: web-pwa, extractor, relator; PARTIAL: ci-cd; NOT BUILT: consolidator, dns-domain-verification) |
| `docs/plans/<area>/v<N>.md` | Active work only; closes into `docs/archive/plans/` via the `/close-plan` checklist |
| `docs/decisions/` | ADRs — **append-only**; supersede with a new ADR, never rewrite (index in [README](docs/decisions/README.md)) |
| `docs/knowledge/` | Deep material not yet realized as code, each with a graduation path |
| `docs/analysis/` | Records of open interventions (e.g. the [auth/onboarding v5+v6 committee review](docs/analysis/auth-onboarding-committee-review.md)) |
| `docs/ops/` | Runbooks: dev, ops, demo (zrok), production deployment, social logins, Floci |
| `docs/archive/` | The only cemetery — frozen, never load-bearing for current truth |

`scripts/docs-hygiene.sh` enforces four failure classes the committee found (broken relative links, heredoc artifacts, dead path refs, process debris in the living set) and runs as a CI step. The working cycle — pick an area, open a plan, one commit per task batch keeping code + living doc + ROADMAP consistent, never lose a sliver, close via the checklist — is spelled out in [docs/README.md](docs/README.md). [AGENTS.md](AGENTS.md) is the condensed operating manual for agents (and the fastest human read).

## Agent tooling (OpenCode)

The repo is wired for AI-assisted work through a senior-engineering-committee model. Details: [docs/agent-tooling.md](docs/agent-tooling.md).

**Ten agents** in `.opencode/agents/`, one per committee role: `architect`, `backend-ts`, `backend-python`, `frontend-svelte`, `database-dba`, `devops-deploy`, `docs-governance`, `e2e-qa` (all `mode: all` — selectable as the session agent or launchable as subagents), and `qa-security` + `reviewer`, deliberately `subagent`-only: a read-only role must never drive a session. Their system prompts encode the repo invariants (NodeNext, 404-on-cross-workspace, `tid` scoping, timestamp ownership).

**Five slash commands** in `.opencode/commands/`: `/next-task` (take the next open item, implement, validate the gate, mark `[x]` with a one-line result), `/new-plan`, `/close-plan`, `/docs-hygiene`, `/review-arch` (code-vs-docs-vs-ROADMAP audit).

**Skills**: a curated catalog under `.agents/skills/` (82 directories) pinned by provenance + content hash in [`skills-lock.json`](skills-lock.json) (74 entries). The methodology batch installed 2026-10-29 — planning/execution/review/debugging skills (obra/superpowers lineage), `reducing-entropy`, `writing-documentation-with-diataxis`, `caddy` + `caddy-reverse-proxy` — each carries a **`## VozLab wiring`** block overriding its upstream defaults to our lifecycle (plans live in `docs/plans/<area>/vN.md`; a checkpoint is a gate-green commit; verification means pasted command output).

**MCP servers** (`opencode.json`):

| Server | Setup |
| --- | --- |
| `postgres` | `crystaldba/postgres-mcp` (the deprecated reference server is banned) in `--access-mode=restricted`, connecting as `mcp_reader` to `vozlab_tenant_dev` **only**. Read-only is engine-enforced (`default_transaction_read_only`, `SELECT`-only grants, `auth.refresh_tokens` revoked, no `CONNECT` on the router DB — it holds tenant connection passwords). Verify a fresh machine with the 4 checks in [docs/agent-tooling.md](docs/agent-tooling.md). Never point it at a production tenant. |
| `github` | Remote server with a fine-grained PAT. **OpenCode V2 does not load `.env` for `{env:}` substitution** (unset → empty string → "Authorization header is badly formatted"). The working pattern: `printf '%s' 'github_pat_…' > ~/.config/opencode/github-pat` (0600, no trailing newline) and `"Authorization": "Bearer {file:~/.config/opencode/github-pat}"` in `opencode.json`. Config is watched; rotation = rewrite the file. |
| `playwright` | `npx @playwright/mcp@latest` — drives the PWA through the accessibility tree. |
| `brave-search`, `context7` | Global research and up-to-date library docs. |
| `chrome-devtools` | Present but `disabled` (opt-in). |

Shell guardrails in `opencode.json`: `git push`, `db:push`, `compose down -v` and `rm -rf` require confirmation.

## Local development gotchas

- **Dev servers are host processes, not containers.** The main compose does *not* start the API or web; run both `pnpm --filter @vozlab/api dev` and `pnpm --filter @vozlab/web dev` on the host. The API's `WEB_ORIGIN` expects the web on :5173.
- **One Redis on 6379.** The API's `REDIS_HOST` must point at the main compose's redis. Two redis instances on that port break OIDC state (`ERR_INVALID_OIDC_STATE`) — check `ss -tlnp | grep 6379` first. The legacy identity-lab no longer publishes its own redis.
- **Fresh volume vs drifted volume.** Compose initdb scripts run only on a fresh volume; CI's freshly migrated+seeded fold is the integration authority, and local test:integration failures may be data drift rather than code bugs.
- Workers in the `workers` profile assume the API runs on the host (`API_BASE_URL=http://host.docker.internal:3000`) and can mint their own agent tokens dev-side with the same `JWT_SECRET` (ADR-0021).

## Deployment

**Nothing is deployed; today everything is dev.** The production topology is decided and instrumented but awaiting its hostname (B11):

- **T2** ([ADR-0043](docs/decisions/ADR-0043-production-topology-caddy-t2.md)): single host, Caddy reverse proxy with automatic TLS, three origins — `app.` (web), `api.` (API), `auth.` (Zitadel) — mirroring the zrok demo 1:1. Backends loopback-only; the API trusts `X-Forwarded-*` from loopback/RFC1918 CIDRs (`apps/api/src/infrastructure/http/proxyTrust.ts`).
- Artifacts: [`docker-compose.prod.yml`](docker-compose.prod.yml), [`deploy/caddy/Caddyfile`](deploy/caddy/Caddyfile), [`deploy/README.md`](deploy/README.md) (the 7-URL callback matrix), [`docs/ops/production-deployment.md`](docs/ops/production-deployment.md) (DNS → Zitadel → OIDC URLs → Caddy → verification runbook).
- **Demo exposure** uses three independent zrok shares (ADR-0040): [`docs/ops/runbook-demo-zrok.md`](docs/ops/runbook-demo-zrok.md) + `scripts/demo.sh`.
- Workers are always-on containers (ADR-0036); Ollama colocated for demo, dedicated GPU node planned for production (ADR-0037). Neither is deployed.

## Status & roadmap

Phases **0, 1, 1R, 1S, 1T** (API core + auth/tenancy) and **3** (PWA) are done; the auth/onboarding v5+v6 intervention is closed on code. Phase **2** is in progress: shared runtime, embedder (FR-18), Relator (FR-19) and source registry exist; the Extractor (FR-17) is partial; **missing: the Consolidator handler (FR-20) and the ingestion producer for `stream:source_raw`**. Phase **4** is defined and largely instrumented (integration CI, coverage, observability stack, T2 deploy pipeline) except the real go-live.

Open items worth knowing ([ROADMAP.md](ROADMAP.md) is the single board):

- **Task 13** — realign the 14 red graph E2E journeys to the toolbar redesign; restores the push trigger on `e2e.yml`.
- **B9** — external Google/Microsoft OAuth client credentials for social logins ([docs/ops/zitadel-social-logins.md](docs/ops/zitadel-social-logins.md)).
- **B11** — production hostname + CSP tuning against a staging build (the last B11 go-live steps).
- Not built: AGE mirroring adapter (bounded SQL CTE is the read path, ADR-0004), SSE (ADR-0015), embedding backfill, `meta.data_sources` management route.
- Security open items (S-02…S-15) tracked in [docs/knowledge/security-baseline.md](docs/knowledge/security-baseline.md).

## Conventions

- Operating rules and hard-to-miss conventions: [AGENTS.md](AGENTS.md); full code conventions (layers, imports, port vocabulary, errors, pagination, events, Python workers): [docs/conventions.md](docs/conventions.md).
- Commit one component/layer at a time; `ROADMAP.md` is the only live task board (never re-open the archived `TODO.md`/`EXECUTION_PLAN.md`); completed work's evidence lives in `docs/components/` + ADRs, not in status notes.
- Code, comments and identifiers are English. `pnpm` only (the workspace pins `pnpm@12.11.2`).

## License

No `LICENSE` file is present. The repository is unlicensed by default; treat it as proprietary/internal until one is added.
