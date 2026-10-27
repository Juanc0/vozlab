# 03 — Current state: assets, verified results, maturity

Everything in this file was measured or read on **2026-10-23**. Line counts are of source files
(TypeScript, Svelte, Python, SQL and Markdown as noted). Test and build results were produced by running
the commands; the commands are listed in `16`.

## 1. Component inventory

| Component | Path | Language and size | What it does | State |
| --- | --- | --- | --- | --- |
| API | `apps/api` | TypeScript, ~11.6k lines in `src`, ~7.6k in `tests` | Fastify REST API: auth, tenancy, nodes, edges, proposals, ontology, discussions, votes, ingestion resolution, health. Hexagonal layout. | Implemented; the core of the product. |
| Web (PWA) | `apps/web` | SvelteKit 5 + Svelte 5 runes, ~27.4k lines in `src`, ~14.5k in `tests` | Workspace UI: graph canvas (SVG painter with a d3-force layout), inspector, proposals, discussions, voting, login, event join, offline shell, Spanish and English. | Phase 3 closed. Online-first. |
| Database package | `packages/database` | Drizzle schemas, 2 router + 8 tenant migrations, ~0.7k lines of schema, ~3.1k lines of scripts | Schemas, migrations, dev seed (Spanish demo), token minting, event codes, MCP read-only role. | Implemented; no fleet tooling. |
| Shared types | `packages/shared-types` | Zod, ~1.2k lines | Request and response contracts, error codes, agent and role allowlists. | Implemented. Zod 3. |
| Shared worker runtime | `packages/worker-shared` | Python, ~1k lines | Settings, JSON logs, agent tokens, HTTP client, Redis Streams consumer, retries, dead-letter. | Implemented and tested. |
| Embedder | `apps/worker-embedder` | Python, ~0.5k lines | `NODE_CREATED` → Ollama embedding → agent-only write-back. | Implemented. Tested in the Python job and its image is built in CI. Not part of any deployment path yet. |
| Relator (Agent 2) | `apps/worker-relacionador` | Python, ~0.7k lines | `NODE_CREATED` → top-5 neighbours → local LLM verdict → `PENDING` edge or merge proposal. | Implemented; recall and governance issues (F-04, F-01). |
| Extractor (Agent 1) | `apps/worker-extractor` | Python, ~0.8k lines | `stream:source_raw` → PII masking → LLM draft → `PENDING` node. | Implemented; **no producer** (F-03). |
| Consolidator (Agent 3) | `apps/worker-consolidador` | Empty | Scheduled synthesis of opportunities (FR-20). | Not started. |
| Docker: Postgres | `docker/postgres` | Dockerfile | `apache/age:release_PG18_1.8.0` plus pgvector. | Works locally; not portable to managed PostgreSQL (F-10). |
| Compose | `docker-compose.yml` | YAML | Postgres, Redis 7, Ollama, three workers behind a profile. | Local only; ports exposed on all interfaces (F-07). |
| CI | `.github/workflows/ci.yml` | YAML | Three jobs: TypeScript (install, build, type-check, test), Python (uv sync, pytest, ruff), worker image builds. | Thin by decision (ADR-0017). No lint, no E2E, no integration database. |
| Documentation | `docs/`, `README.md`, `ROADMAP.md`, `AGENTS.md`, `CLAUDE.md` | ~15.5k lines of Markdown including the archive | 37 ADRs (0001–0037), requirements, domain model, auth, API reference, runbooks, specs, design system, graph research. | Strong content; numbers drift (section 4). |
| Agent tooling | `.opencode/`, `.agents/skills/`, `.claude/`, `opencode.json` | Markdown, JSON | Six subagents, two commands, 56 skill folders, MCP servers. | Rich. One credential is committed (F-06). |

## 2. The API surface

About 35 endpoints. The list below is grouped by responsibility, from the route registration and the
auth and embedding routes. [repo] `apps/api/src/infrastructure/http/`

| Area | Endpoints | Notes |
| --- | --- | --- |
| Health | `/health`, `/health/live`, `/health/ready` | Ready probes the router DB and Redis only; not tenant DBs or Ollama. |
| Auth | `GET /auth/login`, `GET /auth/callback`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/event-join` | OIDC with PKCE; event-code join. No membership management. |
| Nodes | `GET/POST /nodes`, `GET /nodes/:id`, `DELETE /nodes/:id`, `GET /nodes/subgraph`, `GET /nodes/window`, `GET /nodes/:id/neighbors`, `PUT /nodes/:id/embedding` (agent-only) | No endpoint changes a node's status (F-01). |
| Edges | `GET/POST /edges`, `GET/PATCH/DELETE /edges/:id` | PATCH edits relation and attributes for the author. No status transition (F-01). |
| Proposals | `GET/POST /proposals`, `GET /proposals/:id`, `PUT .../approve`, `PUT .../reject`, `PUT .../auto-apply` | Maintainer-only resolution; moderator auto-apply with thresholds. |
| Ontology | `GET /ontology`, `POST` for classes, datatype and object properties, `PUT /ontology/classes/:id/activate` | Only classes can be activated (F-16). |
| Discussions | `GET/POST /discussions`, `GET .../posts`, `POST .../posts`, `PUT .../close`, `DELETE /discussions/posts/:id` | Threads are not linked to proposals automatically (FR-11 partial). |
| Interactions | `POST /interactions` | Votes on nodes, edges, proposals and posts; one per user per target. |
| Ingestion | `GET /ingestion/resolve-source` | Agent-only; no management route for sources. |

## 3. Verified results on 2026-10-23

| Check | Command | Result |
| --- | --- | --- |
| Full build and type-check | `pnpm turbo run build type-check` | **7 of 7 tasks successful.** |
| API tests | `pnpm --filter @vozlab/api test` | **35 files, 200 tests passed.** |
| Web tests | `pnpm --filter @vozlab/web test` | **60 files, 515 tests passed.** |
| Python tests | `uv run pytest` | **105 passed.** |
| Python lint | `uv run ruff check` on the four Python packages | **All checks passed.** |
| Repository lint | `pnpm lint` | **Red: 24 errors and 7 warnings.** All 24 errors are `no-explicit-any`, as documented. The 7 warnings are unused variables, several in graph code that is no longer used (`10` §4). |
| Playwright E2E | Not run in this review | It needs the API and the web app running on dedicated ports. The suite exists. |
| Load tests | None exist | NFR-01, 02, 03 are unmeasured. |

## 4. Documentation drift, measured

Four documents report different test counts. The code does not agree with any of them.

| Source | Says (API tests) | Says (web tests) | Says (Python) | Says (lint) |
| --- | --- | --- | --- | --- |
| `README.md` | 195 unit, 35 files | 631 tests in 79 files | 105 | "26 known `any` errors" |
| `docs/README.md` | 195, 35 files | 552 in 64 files | 105 | 24 errors |
| `ROADMAP.md` (3.49) | — | 552 in 64 files | — | — |
| `ROADMAP.md` (3.37 to 3.47) | — | 613 in 75 files | — | — |
| `AGENTS.md` | — | — | 103 | "24 pre-existing errors" |
| **Measured today** | **195, 35 files** | **515, 60 files** | **105** | **24 errors, 7 warnings** |

Other inconsistencies found while reading: the `README.md` intro says the PWA "has just started
(roadmap 3.1)" while its own table records Phase 3 as complete; the `README.md` status table calls the
embedder "not in Compose/CI yet" while `docker-compose.yml` defines it under a profile and CI builds its
image. The reason for the mismatch is clear: documents are written by hand, at speed, and nothing checks
them. The fix is in `14` §4.

## 5. Maturity by component

Scale: 0 = absent, 1 = scaffold or demo-only, 2 = works on the happy path, 3 = works and tested, 4 = works,
tested and operable in principle, 5 = proven under load and in production. These are judgments. [juicio]

| Area | Score | Why |
| --- | --- | --- |
| API core (nodes, edges, proposals, votes, discussions) | 3 | Tested and well-layered. Not run against a real database in CI. No load evidence. |
| Persistence model and indexes | 3 | Constraints, soft delete, keyset pagination and tuned indexes (ADR-0027). Fleet operations are missing. |
| Authentication and sessions | 3 | Strong design (PKCE, rotation, reuse detection). Not exercised against a real IdP here. Fail-open revocation during Redis outage. |
| Authorisation and governance | 2 | The approval rule is clear. The lifecycle does not close (F-01). |
| Tenancy and onboarding | 2 | Isolation is excellent. Onboarding people and tenants is manual (F-02, F-11). |
| Ontology governance | 2 | Classes work; properties cannot be activated (F-16). |
| Embedding pipeline | 3 | Works end to end. Model is dated and English-centred (F-09). Not part of any deployment path. |
| Relator | 2 | Works on the happy path; recall under filter (F-04); verdicts cannot be accepted (F-01). |
| Extractor | 1 | Worker is written; no input (F-03). |
| Consolidator | 0 | Not started. |
| Web: navigation, forms, governance screens | 3 | Broad, tested, accessibility pass done. Online-first. |
| Web: graph canvas | 3 | Carefully measured (for example, 0 overlapping card pairs at 200 cards). Heavy investment; the SVG painter measured about 42 fps during a wheel pan at 200 cards when roadmap 3.28 was written. |
| UI internationalisation | 4 | Typed dictionary, server-rendered language, locale-aware formatting. |
| Content internationalisation | 1 | Not modelled (`13`). |
| Security controls | 3 | Good core controls; specific gaps (`09`). |
| Observability | 1 | Structured logs and correlation id. No metrics, traces or alerts (F-13). |
| Deployment and infrastructure as code | 0 | No API or web image, no IaC, no deployment job. |
| Quality gates | 3 | Build, type-check and tests are green and gating CI. Lint is red and not gated. |
| Documentation and decisions | 4 for decisions, 2 for currency | ADRs are excellent; numbers drift (section 4). |
| Agent tooling | 3 | Coherent workflows; a committed credential (F-06). |

## 6. Assets worth keeping

These are reusable beyond the current product and should be protected in any refactor.

1. **The guard chain and its tests** (`authGuard → tenantGuard → tenantWorkspaceGuard → rateLimit`).
2. **The ADR set and its format** (`docs/decisions/`, with status, context, alternatives and consequences).
3. **The Spanish demo graph** (24 nodes, 35 relations in three clusters, 4 proposals, 3 threads, 71 votes)
   built by a seed that also prints a report. It is the best storytelling asset for stakeholders. [repo] ROADMAP 3.8
4. **The typed dictionary** that makes missing translations compile errors.
5. **The Python worker runtime** with consumer groups, `XAUTOCLAIM`, bounded attempts and a dead-letter stream.
6. **The design system** (`docs/design-system.md`) with measured contrast and rules for new surfaces.
7. **The measurement habit.** The graph work measured frame times, DOM counts and overlaps before deciding.
   That discipline is rare and should be applied to the API as well (`14`).
8. **The read-only MCP role** for agents, which cannot write and cannot reach the router. Good practice.

## 7. Assets that are weaker than they look

- **The graph canvas has more effort than it has users.** It is excellent to look at and to measure. Its value
  depends on governance and on real content, neither of which is yet in use.
- **The seed.** Its `ACTIVE` nodes hide F-01. It must be labelled as a demonstration fixture and must never be
  used as evidence of the product path.
- **Agent skills.** Fifty-six skill folders and duplicated copies under `.claude/`, `.continue/` and `.qwen/`
  (for example `ios-design`, `ui-taste`) are tracked in git. They add maintenance and a second place to keep
  in step. Keep one canonical copy and generate the others.
- **The CI.** It gates build, type-check, tests, Python, and image builds. It does not gate lint, E2E,
  integration tests, migrations on a fresh database, or secrets scanning.
- **Single-person knowledge.** The reasons behind every decision are in the ADRs, which is good. The
  operational knowledge (how to restore, how to rotate, what to do when Ollama is slow) is not written down
  anywhere a second person could find it. `docs/runbook-ops.md` covers observation, not recovery.

## 8. Working-tree hygiene

- `git status` is clean. Generated folders (`build`, `dev-dist`, `playwright-report`, `.playwright-mcp`,
  `.svelte-kit`) are ignored by `.gitignore`. [repo][run]
- `.env` exists locally, is untracked, and is ignored. `.env.example` is tracked and contains placeholders. [repo]
- `opencode.json` is tracked and contains a plain database password (F-06).
- **Runtime mismatch.** CI and the README say Node 22. The machine used for this review runs **Node v24.22.0**
  and pnpm 12.11.2. The difference is small and harmless today, but it means "works on my machine" and
  "passes in CI" are not guaranteed to be the same statement. Pin one version in `.nvmrc` or `engines`. [run][juicio]
- `pnpm-workspace.yaml` is tracked. Its `-rw-------` mode is unusual for a shared configuration file. [repo]
