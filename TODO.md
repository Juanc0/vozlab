# Active Task Board (VozLab)

> **Atomic task prompts:** `.claude/tasks/TASK-NN_*.md` — one self-contained prompt per
> vertical slice. The current batch is **Phase 1R** (remediation + vertical propagation),
> defined in `EXECUTION_PLAN.md`.
>
> **Executor contract (per task):** read ONLY the assigned task file (it is self-contained),
> implement it, run `pnpm turbo run build`, then mark the task `[x]` below with a one-line
> result note. If the task file is genuinely ambiguous, STOP and ask with structured
> options + pros/cons (Clarification Protocol) instead of guessing.

## PHASE 0: BOILERPLATE AND BASE MONOREPO INFRASTRUCTURE
- [x] MILESTONE-0.1: Monorepo Initialization and Base Tooling (pnpm, turbo, ts-config)
- [x] MILESTONE-0.2: Local Container Orchestration (Docker Compose with Postgres+AGE+pgvector, Redis, Ollama)
  - Custom image `docker/postgres/Dockerfile` = **PG 18.6 + Apache AGE 1.8 + pgvector**
  - `docker compose` **builds** the image (`vozlab/postgres:18-age-pgvector`) + healthcheck
  - Script `packages/database/scripts/02-extensions-and-graph.sql`: extensions per database + `create_graph('vozlab_graph')` + labels
- [x] MILESTONE-0.3: Definition of Shared Types, Zod Schemas and Structured Errors (`packages/shared-types`)
- [x] MILESTONE-0.4: Drizzle ORM Persistence - Router and Tenant Schemas (`packages/database`)
  - Two drizzle-kit configs (router + tenant), migrations generated per database
  - Actual installed pins: drizzle-orm 0.45.4, drizzle-kit 0.31.11 (trust `package.json`, not the older doc notes)
  - ⚠️ Migration drift detected (see TASK-02): `edges.attributes` is in the schema but not in the migrations

## PHASE 1: FASTIFY API CORE BACKEND (`apps/api`)
- [x] MILESTONE-1.1: API Scaffolding and Structured Logger with `reqId` (see TASK-03 — correlation is currently broken)
- [x] MILESTONE-1.2: Domain Layer (Hexagonal Core)
- [x] MILESTONE-1.3: Persistence Adapters and Multi-Tenant Pool Manager
- [x] MILESTONE-1.4: Identity and Isolation Middlewares (Zero-Trust) ✅ COMPLETE
  - `AuthGuard`: JWT verification + Redis O(1) blacklist + system agent detection
  - `TenantWorkspaceGuard`: `X-Workspace-ID` header (UUID) + tenant provisioned in router DB + workspace membership verified in the tenant DB (FR-05, TASK-05) — system agents bypass
  - `RateLimitingMiddleware`: per tenant/workspace limits (NFR-08) (see TASK-07 — window bug)
  - `ConnectionPoolManager`: physical pools per tenant (`tid`) with TTL and eviction
  - `FastifyRequest` type augmentation (identity/tenant) without `any` casts
- [x] MILESTONE-1.5: Use Cases and REST Controllers (Governance) ✅ COMPLETE
  - `CreateNodeUseCase` + `stream:node_created`; `Create/Approve/RejectProposalUseCase`
  - Real Drizzle repos scoped by `tid`; real `RedisEventPublisher`; `/health/ready` (see TASK-04 — probe is decorative)

## PHASE 1R: REMEDIATION & VERTICAL PROPAGATION (current batch)
> Fixes defects in the already-`[x]` milestones above and completes the Edge / Ontology /
> Discussion / Vote verticals (domain + ports + adapters already exist but are unwired).
> Full milestone definitions live in `EXECUTION_PLAN.md`.

### 1R.1 — Correctness & hygiene of completed work
- [x] TASK-01 — Repository hygiene & governance sync (`.gitignore`, stale command files, turbo tasks)
  - Result: `.gitignore` rewritten (`.env`/`.env.*` + `!.env.example`, `.turbo/`, `dist/`, `build/`, `coverage/`, `.venv/`, `__pycache__/`, logs, test artifacts, editor/OS); root `next-task.md`/`review-arch.md` removed (`.claude/commands/*` kept); `turbo.json` now declares `build`/`lint`/`type-check`/`test`/`test:ci` with `outputs: []` (removed the `.next/**` block); removed invalid `allowBuilds` from `pnpm-workspace.yaml` and redundant `workspaces` from root `package.json` (added `type-check` script). `pnpm turbo run build` = 3/3 packages ✓
- [x] TASK-02 — Reset & regenerate Drizzle migrations (fix `edges.attributes` drift)
  - Result: reset `migrations/router/**` + `migrations/tenant/**` to a single fresh `0000_*` per DB (router `0000_jazzy_stone_men.sql`, tenant `0000_illegal_fallen_one.sql`); tenant SQL now has `edges."attributes" jsonb`, `vector(768)`, HNSW/GIN/partial indexes, `unique_user_target_vote`, all `meta.*`/`social.*` tables; router SQL = only `tenants` + `tenant_connections`. Removed `scripts/init-age.sql`. Verified on a fresh DB (`\d edges` → `attributes jsonb`; `\dx` → `age` + `vector`) and `db:migrate` is idempotent. Extra fix: added `ssl: false` to both drizzle-kit configs (v0.31 forces TLS when `ssl` is absent, breaking local `db:migrate`). `pnpm turbo run build` = 3/3 ✓
- [x] TASK-03 — Correlation ID (`reqId`) propagation via AsyncLocalStorage
  - Result: added `bindReqId(id)` to `shared/logger/index.ts` (uses `AsyncLocalStorage.enterWith`, not `run`, so the store survives past the hook); `CorrelationGuard` now calls `bindReqId(req.id)` as its first statement before the incoming-request log, removing the synchronous `withReqId` wrapper. `req.log` carries `reqId` natively (`requestIdLogLabel: 'reqId'`) and later `log.*` calls pick it up from ALS. `pnpm turbo run build` = 3/3 ✓
- [x] TASK-04 — Real `/health/ready` dependency probes
  - Result: added `ping(): Promise<void>` to `IRouterDatabase` + `RouterDatabaseClient` (`SELECT 1` via Drizzle, throws on error); added `RedisTokenBlacklist.ping()` (`PING`, throws when `!connected`); rewrote `HealthController.ready` to probe both and return `200 { status: 'ready', checks: { database, redis } }` or `503 { status: 'degraded', ... }`; `live()` unchanged. `pnpm turbo run build` = 3/3 ✓
- [x] TASK-05 — Enforce workspace membership in `TenantWorkspaceGuard` (FR-05)
  - Result: added `IMembershipRepository` port (+ `WorkspaceRole`) and `DrizzleMembershipRepository` (`isMember`/`getRole` querying `auth.workspace_memberships` by workspace+user in the tenant DB via `tid`); `tenantWorkspaceGuard` now takes `membershipRepo`, skips the check for `req.isSystemAgent`, returns 401 `ERR_INVALID_TOKEN` when no identity, and 403 `ERR_UNAUTHORIZED_WORKSPACE_ACCESS` for non-members before attaching `tid`/`workspaceId`/`tenantSlug`; wired through `server.ts` and `routes.ts`. `pnpm turbo run build` = 3/3 ✓
- [ ] TASK-06 — Typed domain errors + centralized HTTP mapping
- [ ] TASK-07 — Rate limiter fixed-window correctness (NFR-08)

### 1R.2 — Governance correctness (proposals)
- [ ] TASK-08 — Proposal resolution authorization (maintainer / moderator, FR-12/FR-13)
- [ ] TASK-09 — Polymorphic proposal application (EDGE + ONTOLOGY deltas, FR-10/FR-12)

### 1R.3 — Domain vertical propagation (Edges / Ontology / Discussions / Votes / Nodes)
- [ ] TASK-10 — Nodes vertical: controller consistency, read endpoints, cursor pagination, ontology validation (FR-06, NFR-04)
- [ ] TASK-11 — Subgraph endpoint `GET /api/v1/nodes/subgraph` (NFR-01)
- [ ] TASK-12 — Edges vertical: complete repository, use cases, controller, routes (FR-08)
- [ ] TASK-13 — Ontology vertical: datatype/object properties, activation, routes (FR-06/08/09)
- [ ] TASK-14 — Discussions vertical: wire threads/posts + read endpoints (FR-11/FR-16)
- [ ] TASK-15 — Interactions/Votes vertical: wire votes, unify score updates (FR-14/FR-15)
- [ ] TASK-16 — shared-types alignment (error codes, batch-node schema, vote semantics)
- [ ] TASK-17 — Dev seed: provision tenant + base ontology in the router/tenant DBs

## PHASE 2: PYTHON AI WORKERS
- [ ] MILESTONE-2.1 to MILESTONE-2.6 (Extractor and Relator)
- [ ] MILESTONE-2.7 Consolidator (planned — missing from the original plan; see EXECUTION_PLAN.md)

## PHASE 3: SVELTEKIT 5 PWA FRONTEND (`apps/web`)
- [ ] MILESTONE-3.1 to MILESTONE-3.5

## PHASE 4: CI/CD, OBSERVABILITY AND AUTOMATED QA
- [ ] MILESTONE-4.1 to MILESTONE-4.5
