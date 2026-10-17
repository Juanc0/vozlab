---
title: Atomic Execution and Implementation Master Plan (VozLab)
version: 1.0.0
status: APPROVED
owner: Chief Software Architect, Principal Full-Stack Engineer, Staff QA Engineer
---

This document defines the exhaustive and atomic roadmap for building the VozLab monorepo. Each milestone represents a logical unit of work (PR/Commit) designed under strict constraints of physical multi-tenant isolation, transactionality via `UnitOfWork` and hexagonal architectures.

---

## PHASE 0: BOILERPLATE AND BASE MONOREPO INFRASTRUCTURE

### MILESTONE-0.1: Monorepo Initialization and Base Tooling
- **Module / Component:** Project Root
- **Task Description:** Configure the `pnpm` workspace, Turborepo and the global development dependencies (TypeScript, ESLint, Prettier).
- **Affected Files:**
  - `pnpm-workspace.yaml`
  - `turbo.json`
  - `package.json`
  - `.eslintrc.js`
  - `.prettierrc`
  - `packages/ts-config/base.json`
  - `packages/ts-config/package.json`
- **Acceptance Criteria:**
  - [ ] `pnpm install` finishes without errors at the root.
  - [ ] `pnpm turbo run build` runs successfully simulating the empty packages.
  - [ ] `pnpm-workspace.yaml` includes `apps/*` and `packages/*`.

### MILESTONE-0.2: Local Container Orchestration (DB, Redis, LLM)
- **Module / Component:** Local Infrastructure (`docker-compose.yml`)
- **Task Description:** Bring up the base services required for development and integration tests (PostgreSQL with Apache AGE and pgvector, Redis Streams, Ollama).
- **Affected Files:**
  - `docker-compose.yml`
  - `packages/database/scripts/init-age.sql`
- **Acceptance Criteria:**
  - [ ] `docker compose up -d` brings up Postgres, Redis and Ollama correctly.
  - [ ] The SQL initialization script runs `CREATE EXTENSION IF NOT EXISTS "age";` and `CREATE EXTENSION IF NOT EXISTS "vector";`.
  - [ ] Ollama exposes port 11434 and Postgres port 5432.

### MILESTONE-0.3: Definition of Shared Types, Zod Schemas and Structured Errors
- **Module / Component:** `packages/shared-types`
- **Task Description:** Create the centralized library of TypeScript types, Zod validations for DTOs (node creation, voting, proposals) and the strict dictionary of HTTP error codes.
- **Affected Files:**
  - `packages/shared-types/package.json`
  - `packages/shared-types/src/index.ts`
  - `packages/shared-types/src/schemas/node.schema.ts`
  - `packages/shared-types/src/schemas/proposal.schema.ts`
  - `packages/shared-types/src/errors/http-errors.ts` (e.g. `ERR_MISSING_WORKSPACE_HEADER`, `ERR_TENANT_NOT_PROVISIONED`)
- **Acceptance Criteria:**
  - [ ] Zod schemas are exported with strict validation of UUIDs and strings.
  - [ ] The error codes are defined in a unified `enum` or `const` to avoid magic strings.

### MILESTONE-0.4: Drizzle ORM Persistence - Router and Tenant Schemas
- **Module / Component:** `packages/database`
- **Task Description:** Build the ORM mapping strictly separating the Global Manager DB (`vozlab_router` for `auth.tenants`) from the Tenant's Physical DB (`auth.workspaces`, `meta.*`, `public.*`). Configuration of `deleted_at` for soft-deletes.
- **Affected Files:**
  - `packages/database/package.json`
  - `packages/database/drizzle.config.ts`
  - `packages/database/src/schema/router.schema.ts` (Global `tenants` Table)
  - `packages/database/src/schema/tenant.auth.schema.ts`
  - `packages/database/src/schema/tenant.meta.schema.ts`
  - `packages/database/src/schema/tenant.public.schema.ts` (Nodes, Edges with `deleted_at`, Proposals, Interactions)
  - `packages/database/src/index.ts`
- **Acceptance Criteria:**
  - [ ] The Nodes schema includes the custom type `vector(768)` for pgvector.
  - [ ] There are no cross dependencies between the Router schema and the Tenant schema.
  - [ ] Migration generation with `drizzle-kit` runs successfully.

---

## PHASE 1: FASTIFY API CORE BACKEND (`apps/api`)

### MILESTONE-1.1: API Scaffolding and Structured Logger with `reqId`
- **Module / Component:** `apps/api/src/shared` and `infrastructure/http`
- **Task Description:** Initialize the Fastify server configuring `pino` for JSON logging and implementing `AsyncLocalStorage` to automatically inject the Correlation ID (`reqId`).
- **Affected Files:**
  - `apps/api/package.json`
  - `apps/api/src/shared/logger/index.ts`
  - `apps/api/src/shared/config/env.ts` (Zod ENV validation)
  - `apps/api/src/infrastructure/http/server.ts`
  - `apps/api/src/infrastructure/http/middlewares/CorrelationGuard.ts`
- **Acceptance Criteria:**
  - [ ] Every log fired through the logger includes `{ "reqId": "..." }` dynamically.
  - [ ] The server reads strongly typed environment variables and fails at startup if any is missing.

### MILESTONE-1.2: Domain Layer (Hexagonal Core)
- **Module / Component:** `apps/api/src/domain`
- **Task Description:** Definition of pure interfaces without external dependencies (Ports), Value Objects and rich Entities.
- **Affected Files:**
  - `apps/api/src/domain/entities/Node.ts`
  - `apps/api/src/domain/entities/EditProposal.ts`
  - `apps/api/src/domain/value_objects/AuthorHash.ts`
  - `apps/api/src/domain/ports/INodeRepository.ts`
  - `apps/api/src/domain/ports/IUnitOfWork.ts`
  - `apps/api/src/domain/ports/IRouterDatabase.ts`
- **Acceptance Criteria:**
  - [ ] No file inside `domain/` imports libraries such as Fastify, Drizzle or Postgres.
  - [ ] The state transition rules (`DRAFT` -> `PENDING` -> `ACTIVE`) are in methods of the entity.

### MILESTONE-1.3: Persistence Adapters and Multi-Tenant Pool Manager
- **Module / Component:** `apps/api/src/infrastructure/persistence`
- **Task Description:** Implement a Drizzle connection cache manager that resolves physical credentials by querying the `vozlab_router` according to `tid`. Implement the `UnitOfWork` pattern.
- **Affected Files:**
  - `apps/api/src/infrastructure/persistence/ConnectionPoolManager.ts`
  - `apps/api/src/infrastructure/persistence/RouterDatabaseClient.ts`
  - `apps/api/src/infrastructure/persistence/UnitOfWork.ts`
  - `apps/api/src/infrastructure/persistence/repositories/DrizzleNodeRepository.ts`
- **Acceptance Criteria:**
  - [ ] `ConnectionPoolManager` reuses active pools per `tid` and closes them after inactivity.
  - [ ] `UnitOfWork` provides a transaction object (`tx`) that repositories can consume to run atomic queries.

### MILESTONE-1.4: Identity and Isolation Middlewares (Zero-Trust)
- **Module / Component:** `apps/api/src/infrastructure/http/middlewares`
- **Task Description:** Validate the signed JWT, extract `tid`, inject the corresponding DB Pool and verify Workspace membership (`X-Workspace-ID`). Redis blacklist.
- **Affected Files:**
  - `apps/api/src/infrastructure/http/middlewares/AuthGuard.ts`
  - `apps/api/src/infrastructure/http/middlewares/TenantWorkspaceGuard.ts`
  - `apps/api/src/infrastructure/events/RedisTokenBlacklist.ts`
- **Acceptance Criteria:**
  - [ ] A request without `X-Workspace-ID` returns a standardized HTTP 400.
  - [ ] If `tid` does not exist in the Router DB, it returns HTTP 403 `ERR_TENANT_NOT_PROVISIONED`.
  - [ ] A token in the Redis Blacklist causes an immediate HTTP 401 ($\mathcal{O}(1)$).

### MILESTONE-1.5: Use Cases and REST Controllers (Governance)
- **Module / Component:** `apps/api/src/application/use_cases` and `infrastructure/http/controllers`
- **Task Description:** Implement the node creation flow, proposals and healthcheck endpoints using the Composition Root pattern. Publication to Redis Streams post-commit.
- **Affected Files:**
  - `apps/api/src/application/use_cases/CreateNodeUseCase.ts`
  - `apps/api/src/application/use_cases/ApproveProposalUseCase.ts`
  - `apps/api/src/infrastructure/http/controllers/NodeController.ts`
  - `apps/api/src/infrastructure/http/controllers/HealthController.ts`
  - `apps/api/src/infrastructure/http/routes.ts`
  - `apps/api/src/infrastructure/events/RedisEventPublisher.ts`
- **Acceptance Criteria:**
  - [ ] `CreateNodeUseCase` saves the node and emits the asynchronous event `stream:node_created` to Redis (including `reqId`).
  - [ ] `ApproveProposalUseCase` wraps the node update and the proposal status change inside the `UnitOfWork`.
  - [ ] `/health/ready` verifies connectivity to the Router DB and Redis.

---

## PHASE 1R: REMEDIATION & VERTICAL PROPAGATION (Edge / Ontology / Discussion / Vote)

> Added by the architecture re-audit (2026-10-16). This phase fixes verified defects in the
> already-`[x]` Phase 0/1 milestones and completes the domain verticals that already exist as
> code (entities, ports, Drizzle adapters, use cases, controllers) but are **not wired** into
> the HTTP layer. Each milestone maps to one atomic, self-contained task prompt under
> `.claude/tasks/`. Decision: auth transport is **Bearer JWT** (docs are updated to match);
> migrations are **reset and regenerated** from the Drizzle schema.

### MILESTONE-1R.1: Correctness & Hygiene of Completed Work
- **Module / Component:** repo root, `apps/api/src/shared`, `apps/api/src/infrastructure/http`, `packages/database`
- **Tasks:** TASK-01 … TASK-07
- **Task Description:** Fix the defects found in completed milestones:
  - Repository hygiene (`.gitignore`, stale duplicate command files, Turbo pipeline tasks).
  - Reset and regenerate Drizzle migrations so the schema and migrations agree (`edges.attributes` drift).
  - Propagate `reqId` through `AsyncLocalStorage` (`enterWith`) so it reaches use cases and repositories.
  - Implement real `/health/ready` dependency probes (Router DB + Redis).
  - Enforce workspace membership (`auth.workspace_memberships`) in `TenantWorkspaceGuard`.
  - Replace string-matched domain errors with typed `DomainError` and centralized HTTP mapping.
  - Fix the rate limiter window semantics (NFR-08).
- **Acceptance Criteria:**
  - [ ] `pnpm turbo run build` passes after every task.
  - [ ] A fresh migration set contains `edges.attributes` and all NFR-01/02 indexes.
  - [ ] `/health/ready` returns 503 when Postgres or Redis is down.
  - [ ] A user without membership in the header workspace receives 403.

### MILESTONE-1R.2: Governance Correctness (Proposals)
- **Module / Component:** `apps/api/src/application/use_cases`, `apps/api/src/domain/ports`
- **Tasks:** TASK-08, TASK-09
- **Task Description:** Enforce FR-12/FR-13 authorization (only the target's maintainer — or a moderator for `AUTO_APPLIED` — may resolve a proposal) and make proposal application polymorphic (apply deltas to `NODE`, `EDGE` and `ONTOLOGY` targets).
- **Acceptance Criteria:**
  - [ ] A non-author, non-moderator cannot approve/reject (403).
  - [ ] Approving an EDGE proposal mutates the edge; approving an ONTOLOGY proposal activates the class.

### MILESTONE-1R.3: Domain Vertical Propagation
- **Module / Component:** `apps/api/src/{domain,application,infrastructure}`, `packages/shared-types`
- **Tasks:** TASK-10 … TASK-17
- **Task Description:** Wire and complete the Edge, Ontology, Discussion, Interaction/Vote and Node verticals: real read endpoints, cursor-based pagination (NFR-04), the subgraph endpoint (NFR-01), ontology validation on node creation (FR-06), and a dev seed for tenant provisioning + base ontology.
- **Acceptance Criteria:**
  - [ ] `routes.ts` registers `/edges`, `/ontology`, `/discussions`, `/interactions` and real (non-stub) node/proposal reads.
  - [ ] `GET /api/v1/nodes/subgraph` returns a workspace-scoped subgraph.
  - [ ] No controller returns hard-coded empty payloads for implemented resources.

---

## PHASE 1S: CONSOLIDATION, IDENTITY & DEV READINESS

> Added by the Phase-1R review (2026-10-17,
> `.claude/reviews/REVIEW-2026-10-17_phase-1r.md`). Phase 1R delivered all 17 vertical tasks and
> the monorepo type-checks, but a fresh audit found integration/policy gaps: the API cannot boot
> for local dev, no caller can obtain a token, and several cross-workspace / identity /
> soft-delete edges remain open. Each milestone maps to one atomic, self-contained task prompt
> under `.claude/tasks/` (TASK-18…31).

### MILESTONE-1S.1: Correctness & Bootstrap
- **Module / Component:** repo root, `packages/{database,shared-types}/package.json`,
  `apps/api/src/{application,infrastructure}`
- **Tasks:** TASK-18, TASK-22, TASK-23, TASK-24, TASK-30
- **Task Description:** Make the API resolvable and bootable under `tsx` (export conditions +
  `.env.example`), enforce **workspace** isolation inside a tenant (edges, proposals, threads,
  ontology), replace the hard-coded `GET /proposals[/:id]` stubs with real reads, de-duplicate the
  keyset cursor helpers and make soft-delete a single-writer operation, and map infrastructure
  failures to 503 (not 403) with a graceful shutdown.
- **Acceptance Criteria:**
  - [ ] `cd apps/api && node -e "require.resolve('@vozlab/database')"` succeeds; `.env.example` lists every var from `env.ts`.
  - [ ] Addressing an object of another workspace inside the same tenant yields 404, never a mutation.
  - [ ] `GET /api/v1/proposals` and `/proposals/:id` return real, workspace-scoped data.
  - [ ] One `keyset.ts` helper; one writer of `deleted_at`.
  - [ ] A router-DB outage answers 503 `ERR_DATABASE_CONNECTION_FAILED`; `SIGTERM` closes cleanly.

### MILESTONE-1S.2: Identity
- **Module / Component:** `packages/database/scripts`, `packages/shared-types`,
  `apps/api/src/infrastructure/http/middlewares`
- **Tasks:** TASK-19, TASK-20, TASK-21
- **Task Description:** Provision multiple dev users/roles and a dev-only JWT minting script so
  every endpoint is testable without an IdP; derive the author hash from a configured
  institutional salt and remove the shared `'unknown'`/`'anonymous'`/`'default-salt'` placeholders;
  define and document the system-agent (AI worker) identity contract.
- **Acceptance Criteria:**
  - [ ] `db:seed:dev` provisions 4 users / 3 memberships idempotently; `db:mint-token` prints a valid token.
  - [ ] `grep -rn "default-salt" apps/api/src` is empty; a token without `sub` is rejected 401.
  - [ ] `AgentTypeSchema` is the single agent allowlist; the worker contract is documented.

### MILESTONE-1S.3: Policy
- **Module / Component:** `apps/api/src/{application,infrastructure,domain}`, `docs/`
- **Tasks:** TASK-25, TASK-26, TASK-27, TASK-28, TASK-29
- **Task Description:** Write down and implement the soft-delete policy (filter reads, add node/
  post deletion, document status-based tables); key the rate limiter by actor (+ coarse workspace
  ceiling); centralize the `interactionType → value` mapping in a `VoteValue` value object and
  record the CQRS-vs-synchronous decision; replace boundary magic strings with shared typed enums;
  bound the subgraph CTE, index the traversal, and record the Apache AGE decision.
- **Acceptance Criteria:**
  - [ ] Soft-deleted rows never leak on read; the policy table is in `modules_01`.
  - [ ] Per-actor rate buckets; one actor cannot lock out the workspace.
  - [ ] `VoteValue` is the only mapping; the CQRS decision is recorded.
  - [ ] `EXPLAIN ANALYZE` shows index usage for the subgraph query; the AGE decision is recorded.

### MILESTONE-1S.4: Quality
- **Module / Component:** `apps/api/vitest.config.ts`, `apps/api/tests/`
- **Tasks:** TASK-31
- **Task Description:** Stand up the Vitest setup (with NodeNext `.js`→`.ts` resolution) and cover
  the pure domain entities, the `AuthorHash`/`keyset` helpers and one use case with fakes.
- **Acceptance Criteria:**
  - [ ] `pnpm --filter @vozlab/api test` passes with ≥ 6 test files, no DB/Redis.
  - [ ] `pnpm turbo run build` still passes and does not type-check `tests/**`.

---

## PHASE 2: PYTHON AI WORKERS

### MILESTONE-2.1: Python Environment Initialization and Common Base
- **Module / Component:** `apps/worker-extractor` and `apps/worker-relacionador`
- **Task Description:** Create the Python 3.12 projects with Poetry, install base dependencies (httpx, psycopg3, redis-py, pydantic) and structure logs with `structlog`.
- **Affected Files:**
  - `apps/worker-extractor/pyproject.toml`
  - `apps/worker-relacionador/pyproject.toml`
  - `apps/worker-extractor/src/logger.py`
  - `apps/worker-relacionador/src/logger.py`
- **Acceptance Criteria:**
  - [ ] Poetry virtual environments install without errors.
  - [ ] `structlog` is configured to read and spit out JSON with the `reqId` field.

### MILESTONE-2.2: Extractor Worker - Consumption, Deduping and Cache
- **Module / Component:** `apps/worker-extractor/src`
- **Task Description:** Webhook consumer (simulated via the Redis queue `stream:source_raw`). Implement initial semantic deduplication against root entities cached in Redis.
- **Affected Files:**
  - `apps/worker-extractor/src/redis_client.py`
  - `apps/worker-extractor/src/main.py`
  - `apps/worker-extractor/src/cache_manager.py`
- **Acceptance Criteria:**
  - [ ] The worker reads messages from the queue using `XREADGROUP` and does `XACK` only upon successfully finishing the process.
  - [ ] It queries the local cache before proceeding with parsing.

### MILESTONE-2.3: Extractor Worker - PII Sanitization and LLM
- **Module / Component:** `apps/worker-extractor/src`
- **Task Description:** PII filter and prompting module with Ollama to structure atomic JSON from the raw text.
- **Affected Files:**
  - `apps/worker-extractor/src/sanitizer.py`
  - `apps/worker-extractor/src/extractor_llm.py`
- **Acceptance Criteria:**
  - [ ] Names, emails and national ID numbers are replaced by `[MASKED]` BEFORE being sent to Ollama.
  - [ ] The parser strictly returns the Pydantic model `ExtractedNodePayload`.

### MILESTONE-2.4: Extractor Worker - Batch API Client
- **Module / Component:** `apps/worker-extractor/src`
- **Task Description:** HTTP client to send the homogenized nodes to Fastify injecting the bot JWT and required headers.
- **Affected Files:**
  - `apps/worker-extractor/src/api_client.py`
- **Acceptance Criteria:**
  - [ ] It includes `X-Workspace-ID` and Correlation ID `x-correlation-id` in the headers of the REST request towards Fastify.

### MILESTONE-2.5: Relator Worker - Consumption and HNSW Search
- **Module / Component:** `apps/worker-relacionador/src`
- **Task Description:** Consumer of `stream:node_created`. Connection to the Tenant's physical DB (psycopg3) to run a vector search in pgvector limited to the top 5 neighbors.
- **Affected Files:**
  - `apps/worker-relacionador/src/main.py`
  - `apps/worker-relacionador/src/db_client.py`
- **Acceptance Criteria:**
  - [ ] It runs an SQL query using the `<=>` operator (cosine similarity) strictly filtered by `workspace_id`.
  - [ ] It handles PostgreSQL connection failures by re-queuing the message in the Redis Pending Entries List (PEL).

### MILESTONE-2.6: Relator Worker - LLM Evaluation and Action
- **Module / Component:** `apps/worker-relacionador/src`
- **Task Description:** Evaluate the semantic relationship of the neighbors via Ollama. If there is a strong similarity, send an `EDGE_PROPOSAL` (or `MERGED_INTO`) to the Fastify API.
- **Affected Files:**
  - `apps/worker-relacionador/src/evaluator.py`
  - `apps/worker-relacionador/src/api_client.py`
- **Acceptance Criteria:**
  - [ ] If the LLM response is `EDGE`, it does a POST to `/api/v1/proposals` to suggest the relationship in `PENDING` state. It does not create active edges directly.

### MILESTONE-2.7: Consolidator Worker — Cluster Synthesis and Opportunities
- **Module / Component:** `apps/worker-consolidador`
- **Task Description:** The third agent required by `docs/00_ARCHITECTURE_OVERVIEW.md` §2 and US-09 was missing from the original plan. Implement the scheduled Worker that queries dense subgraphs/high-interaction clusters (SQL/AGE), synthesizes the "Consolidated Improvement Opportunity" with Ollama, and publishes it to the PWA.
- **Affected Files:** `apps/worker-consolidador/pyproject.toml`, `apps/worker-consolidador/src/{config,db_client,llm_client,consolidator,main}.py`
- **Acceptance Criteria:**
  - [ ] Runs on a cron schedule and is idempotent.
  - [ ] Publishes the synthesized opportunity through the Fastify API (never writes to the DB directly).

### Deferred (tracked, out of the current batch scope)
The re-audit also identified work that is **not** part of Phase 1R/1S and has no milestone yet. It is recorded here so it is not lost:
- **Auth flow endpoints** (FR-01/FR-03/§5): `/api/v1/auth/login`, `/auth/callback`, `/auth/event-join`, `/auth/logout` (invokes `RedisTokenBlacklist.revoke`), plus an `event_codes` table. Phase 1S ships **dev-only** token minting (TASK-19) as an interim.
- **Apache AGE integration** (docs/00, modules_01 §4): an `AgeGraphRepository` with Cypher mirroring of nodes/edges into `vozlab_graph`. **Decision (TASK-29): keep the bounded SQL recursive CTE for the read path; AGE is its own milestone (mirroring + reconciliation + backfill).**
- **Redis-buffered CQRS vote scoring** (`modules_01 §5`): **Decision (TASK-27): keep the synchronous atomic DB increment (FR-15); the Redis-buffered variant is deferred, not implemented piecewise.**
- **GraphQL**: not chosen (the spec mandates Fastify + REST + Zod + `X-Workspace-ID`); a thin read-only facade can be added later without redesign.
- **SSE notifications** to the PWA (system_03 §4).
- **Type-safety debt:** replace `tx?: any` across the ports with a real transaction type (M3).
- **Consolidator/Extractor/Relator Dockerfiles** and per-service CI (devops_01).

---

## PHASE 3: SVELTEKIT 5 PWA FRONTEND (`apps/web`)

### MILESTONE-3.1: SvelteKit 5, Tailwind and PWA Plugin Configuration
- **Module / Component:** `apps/web`
- **Task Description:** Initial frontend scaffolding with SvelteKit 5, TailwindCSS integration and configuration of the Vite PWA service worker.
- **Affected Files:**
  - `apps/web/package.json`
  - `apps/web/svelte.config.js`
  - `apps/web/vite.config.ts`
  - `apps/web/tailwind.config.js`
  - `apps/web/src/app.html`
- **Acceptance Criteria:**
  - [ ] The server compiles and starts in SSR mode.
  - [ ] The PWA manifest is generated and the Service Worker intercepts requests.

### MILESTONE-3.2: Reactive Global State (Svelte Runes) and Per-Tab Isolation
- **Module / Component:** `apps/web/src/lib/state`
- **Task Description:** Implement state classes with runes (`$state`, `$derived`) and couple the `workspaceId` to the `sessionStorage`. Generic fetch interceptor.
- **Affected Files:**
  - `apps/web/src/lib/state/workspace.svelte.ts`
  - `apps/web/src/lib/api/httpClient.ts`
- **Acceptance Criteria:**
  - [ ] Changing Workspace in one tab does not affect the state of another open tab.
  - [ ] `httpClient` automatically injects the `X-Workspace-ID` header and reads from `sessionStorage`.

### MILESTONE-3.3: Routing via Group Layouts
- **Module / Component:** `apps/web/src/routes`
- **Task Description:** Separation of public routes (SSO Login, Event QR) and private routes (Graph, Proposals).
- **Affected Files:**
  - `apps/web/src/routes/(auth)/login/+page.svelte`
  - `apps/web/src/routes/(auth)/join/+page.svelte`
  - `apps/web/src/routes/(app)/+layout.svelte`
  - `apps/web/src/routes/(app)/+page.svelte` (Canvas View)
- **Acceptance Criteria:**
  - [ ] `(app)/+layout.svelte` redirects to `/login` if no active session is detected.

### MILESTONE-3.4: Graph Rendering Engine (Cytoscape.js)
- **Module / Component:** `apps/web/src/lib/components`
- **Task Description:** Reactive component (`$effect`) that initializes the graph canvas using the Cytoscape.js `dagre` engine.
- **Affected Files:**
  - `apps/web/src/lib/components/GraphCanvas.svelte`
- **Acceptance Criteria:**
  - [ ] It renders an array of Nodes and Edges passed via `$props` applying Tailwind/institutional color styles.
  - [ ] Clicking a node emits a custom event or updates the state to open the side details panel.

### MILESTONE-3.5: Governance Panels and Discussion Threads
- **Module / Component:** `apps/web/src/routes/(app)/proposals` and `discussions`
- **Task Description:** User interface to visualize knowledge Pull Requests, vote (upvote/downvote) and approve or reject (if the user is the original author).
- **Affected Files:**
  - `apps/web/src/routes/(app)/proposals/+page.svelte`
  - `apps/web/src/lib/components/DiscussionThread.svelte`
  - `apps/web/src/lib/components/VoteControls.svelte`
- **Acceptance Criteria:**
  - [ ] The "Approve Merge" button is only enabled if the local `author_hash` matches that of the target node.
  - [ ] Voting triggers an optimistic mutation in the frontend before confirming the HTTP 200 request.

---

## PHASE 4: CI/CD, OBSERVABILITY AND AUTOMATED QA

### MILESTONE-4.1: Strict Unit Tests (Domain and Types)
- **Module / Component:** `apps/api` and `packages/shared-types`
- **Task Description:** Vitest setup to validate business behaviors and validation rules without touching the database.
- **Affected Files:**
  - `apps/api/vitest.config.ts`
  - `apps/api/tests/domain/Node.spec.ts`
  - `apps/api/tests/application/ApproveProposalUseCase.spec.ts` (Using In-Memory mocks)
- **Acceptance Criteria:**
  - [ ] Test coverage > 85% in the `domain` and `application` folders.
  - [ ] Intentional failures (e.g. invalid state transitions) throw the corresponding domain error.

### MILESTONE-4.2: Integration Tests (Ephemeral Database)
- **Module / Component:** `apps/api/tests/integration`
- **Task Description:** Tests against a Docker container brought up programmatically (Testcontainers or script setup) evaluating Drizzle, UnitOfWork and Redis.
- **Affected Files:**
  - `apps/api/tests/setup-integration.ts`
  - `apps/api/tests/integration/DrizzleNodeRepository.spec.ts`
- **Acceptance Criteria:**
  - [ ] It is verified that `UnitOfWork` actually runs `ROLLBACK` in the database if a throw occurs inside the callback.

### MILESTONE-4.3: Critical End-to-End Tests (Playwright)
- **Module / Component:** `apps/web/tests`
- **Task Description:** Automate the critical user flow: Login -> Create Node -> Suggest Edge -> Approve.
- **Affected Files:**
  - `apps/web/playwright.config.ts`
  - `apps/web/tests/e2e/governance-flow.spec.ts`
- **Acceptance Criteria:**
  - [ ] The Playwright bot manages to complete the lifecycle without JS errors in the browser console.

### MILESTONE-4.4: Stress Seeding and Graph Benchmarking (k6)
- **Module / Component:** `packages/database/scripts` and `tests/load`
- **Task Description:** Drizzle script to inject 10,000 Nodes and 50,000 Edges. k6 script to test concurrency of subgraph queries.
- **Affected Files:**
  - `packages/database/scripts/seed-stress.ts`
  - `tests/load/k6-graph-query.js`
- **Acceptance Criteria:**
  - [ ] The `seed-stress.ts` script runs in transactional batches inserting in under 1 minute locally.
  - [ ] The k6 report verifies that the GET endpoint `/api/v1/nodes/subgraph` with filter responds in $p_{95} < 30\text{ms}$.

### MILESTONE-4.5: GitHub Actions CI/CD Pipeline
- **Module / Component:** `.github/workflows`
- **Task Description:** Consolidate the verification pipeline that runs linting, strict typing, tests and coverage reporting when Pull Requests are created.
- **Affected Files:**
  - `.github/workflows/ci.yml`
- **Acceptance Criteria:**
  - [ ] The pipeline makes use of `actions/cache` to speed up `pnpm install`.
  - [ ] It uses Turborepo (`turbo run test:ci lint`) to run processes in parallel.
  - [ ] It blocks the merge if any test fails or the typecheck explodes.
