# MASTER PROMPT: GENERATION OF THE MASTER CONSTRUCTION PLAN (EXECUTION PLAN) FOR THE VOZLAB MONOREPO

**MODEL ROLE:**
Act as an elite tripartite team composed of a **Chief Software Architect**, a **Principal Full-Stack Engineer (TypeScript/Python)**, and a **Staff QA Engineer**. Your objective is to exhaustively analyze the entirety of the technical specification documents of the "VozLab" project attached in the conversation (`docs/00_ARCHITECTURE_OVERVIEW.md`, `docs/system/*`, `docs/modules/*`, and `docs/devops/*`) and synthesize a **Master Execution and Atomic Implementation Plan** packaged into a single file structured in Markdown called `.dev-state/EXECUTION_PLAN.md`.

---

## 1. DESIGN PRINCIPLES AND ARCHITECTURE INVARIANTS (NON-NEGOTIABLE)

Any task in the plan must be strictly aligned with the following system rules:
1. **MONOREPO STRUCTURE:** `pnpm` workspaces + Turborepo (`apps/api`, `apps/web`, `apps/worker-relacionador`, `apps/worker-extractor`, `packages/database`, `packages/shared-types`).
2. **HEXAGONAL ARCHITECTURE (BACKEND API):** The `domain/` layer knows nothing about Fastify, Drizzle, or Redis. Explicit dependency injection through the *Composition Root* pattern.
3. **MULTI-TENANCY WITH PHYSICAL ISOLATION:** Global Manager Database (`vozlab_router`) that dynamically resolves the credentials and the connection pool toward the physically independent databases per institution according to the `tid` claim of the OIDC ID Token (Azure AD).
4. **UNIVERSAL GOVERNANCE:** Absolutely every creation or modification of content (Nodes, Edges, Ontological Proposals), whether produced by an AI Agent or by an end user, is born in a transitory state (`DRAFT` / `PENDING`) linked to a discussion thread (`social.discussion_threads`) and subject to voting/approval.
5. **MULTI-SOURCE INGESTION AND CACHE:** 
   - Incoming webhooks are processed in a Serverless / isolated manner (`API Gateway + AWS Lambda` or a fast ingestion endpoint `202 Accepted` to a queue).
   - Source ingestion via queues in Redis Streams (`stream:source_raw`).
   - Redis cache of the active ontology (`meta.*`) and of the key Root Entities of the university for local semantic deduping in Agent 1 before touching the DB.
6. **ATOMIC COMMITS AND QA RULE:** Each task in the plan must be of small granularity (completable in a single code cycle), autonomous, testable, and explicitly include its **Acceptance Criteria**.

---

## 2. CRITICAL POINTS AND EDGE CASES YOU MUST INCLUDE IN THE PLAN (TOTAL COVERAGE)

Make sure the task list explicitly contemplates the following details that are usually omitted in rushed executions:
- **Error and Transaction Management:** Implementation of the `UnitOfWork` pattern for atomic multi-table mutations (node creation + audit log + discussion thread creation in a single DB transaction).
- **Traceability and Observability:** Mandatory propagation of the Correlation ID (`reqId`) from the PWA/API to the Python Workers using `AsyncLocalStorage` and `structlog`.
- **PII Sanitization:** Module for masking and anonymizing personal data in the Extractor Agent before sending payloads to the Fastify API.
- **Stress Seeding:** Test population scripts with 10,000 nodes and 50,000 edges to validate B-Tree, GIN, and HNSW (`pgvector`) indexes under k6.
- **Structured HTTP Error Handling:** Unified schema of error responses with codes (`ERR_MISSING_WORKSPACE_HEADER`, `ERR_UNAUTHORIZED_WORKSPACE_ACCESS`, etc.).

---

## 3. REQUIRED OUTPUT FORMAT (`.dev-state/EXECUTION_PLAN.md`)

Generate the work plan organized strictly into the following **PHASES and MILESTONES**. Each Milestone must detail:
- **ID:** Unique identifier (e.g., `MILESTONE-1.1`).
- **Module / Component:** Exact location of the files in the Monorepo.
- **Task Description:** What code or configuration must be built.
- **Affected Files:** Explicit list of file paths to create/modify.
- **Acceptance Criteria:** Checkbox with the exact condition that the Reviewer Agent or the automated test must validate in order to consider it approved and make the `git commit`.

### PHASE STRUCTURE TO BREAK DOWN IN THE PLAN:

1. **PHASE 0: BOILERPLATE AND BASE MONOREPO INFRASTRUCTURE**
   - Configuration of `pnpm-workspace.yaml`, `turbo.json`, root `package.json`.
   - Configuration of the Docker Compose container (`PostgreSQL 16` with `pgvector`, `Redis 7`, `Ollama`).
   - Creation of the `packages/database` package with Drizzle ORM, Manager DB client (`vozlab_router`), and dynamic Multi-tenant DB client.
   - Creation of the `packages/shared-types` package with shared Zod schemas and TypeScript types.

2. **PHASE 1: CORE BACKEND FASTIFY API (`apps/api`)**
   - Implementation of the Hexagonal Architecture (Domain, Use Cases, Ports, Adapters).
   - Middlewares: `AuthGuard` (OIDC/JWT), `TenantWorkspaceGuard` (dynamic DB resolution by `tid` and membership validation).
   - Transactions with `UnitOfWork` and asynchronous publishing to Redis Streams.
   - REST API Endpoints (Nodes, Edges, Proposals, Discussion Threads, Batch Ingestion).
   - Healthcheck Endpoints (`/health/live`, `/health/ready`).

3. **PHASE 2: AI WORKERS IN PYTHON (`apps/worker-extractor` and `apps/worker-relacionador`)**
   - Project structure in Python 3.12 with Poetry/pip.
   - `worker-extractor`: Connectors, PII Sanitizer, atomic extraction with LLM/Ollama, Batch Ingestion to Fastify, and Redis Cache of Root Entities.
   - `worker-relacionador`: Redis Streams Consumer (`XREADGROUP`), HNSW Search in `pgvector`, Semantic Qualitative Evaluation with Ollama, and Emission of `EDGE_PROPOSAL` in `PENDING` state.

4. **PHASE 3: SVELTEKIT 5 PWA FRONTEND (`apps/web`)**
   - SvelteKit 5 configuration with Runes (`$state`, `$derived`, `$effect`).
   - Group Layouts (`(app)` protected, `(auth)` public).
   - Workspace state in `sessionStorage` isolated per tab.
   - Canvas component for Graph rendering with Cytoscape.js (`dagre` layout).
   - Panel for Discussion Threads, Edit Proposals, and Granular Voting.
   - PWA Service Worker offline/online-first status.

5. **PHASE 4: CI/CD, OBSERVABILITY, AND AUTOMATED QA**
   - GitHub Actions Workflows (`ci.yml`).
   - Structured JSON Pino Logger with `reqId`.
   - Unit/Integration Tests with Vitest + ephemeral Docker.
   - E2E Tests with Playwright.
   - Stress Seeding and Graph Benchmarking Scripts with k6.

---

**PLEASE, NOW GENERATE THE COMPLETE, DETAILED, EXTENSIVE, AND EXTRACTED FILE `.dev-state/EXECUTION_PLAN.md`, WITHOUT ABBREVIATING ANY STEP OR USING PLACEHOLDERS SUCH AS "..." OR "REPEAT FOR OTHERS".**