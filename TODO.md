# Active Task Board (VozLab)

> **Atomic task prompts:** `.claude/tasks/TASK-NN_*.md` — one self-contained prompt per
> vertical slice. The current batch is **Phase 1T** (dev ergonomics, layering & ingestion
> contract, TASK-32…45); Phase 1R (TASK-01…17) and Phase 1S (TASK-18…31) are complete. All are
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
  - `RateLimitingMiddleware`: per tenant/workspace fixed-window limits (NFR-08, TASK-07)
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
- [x] TASK-06 — Typed domain errors + centralized HTTP mapping
  - Result: added `domain/errors/DomainError.ts` (`DomainErrorCode` union + `DomainError` class, no HTTP deps); replaced every `throw new Error('ERR_…')`/template-`Error` in the 7 entities + 6 use cases (+ `DrizzleNodeRepository`) with `new DomainError(code, detail)`; added `ERR_UNMET_AUTO_APPLY_CRITERIA` (422) and `ERR_AUTHORIZATION_FAILED` (403) to `ERROR_CODES`; rewrote `errorResponse.ts` `mapDomainError` to use `instanceof DomainError` + a known-code guard (removed all `message.includes`); `NodeController`/`ProposalController` now share `getRequestContext` + `sendError` + `mapDomainError`; `AuthorHash` programmer errors are plain `Error` (no `ERR_` token). Also converted the two stray infrastructure tokens: `ConnectionPoolManager` now throws `DomainError('ERR_TENANT_NOT_PROVISIONED')` (added to the union), and the unreachable `DrizzleInteractionRepository` switch default is a plain `Error` (no `ERR_` token). `pnpm turbo run build` = 3/3 ✓
- [x] TASK-07 — Rate limiter fixed-window correctness (NFR-08)
  - Result: replaced `INCRBYFLOAT` + unconditional `EXPIRE` (which refreshed the TTL on every request and effectively locked a bucket once it hit the limit) with integer `INCR` and a conditional `EXPIRE` that only runs when `count === 1`, anchoring the window at the first request; removed the `expire(key, floor(window/2))` branch; `windowSeconds` now `Math.ceil(env.RATE_LIMIT_WINDOW_MS / 1000)` to guarantee an integer for `EXPIRE`. Key format, `getRateLimitMax`, `isRateLimited`/`rateLimitMiddleware` signatures, the `ERR_RATE_LIMIT_EXCEEDED` 429 path, and the fail-open `catch` all unchanged. `pnpm turbo run build` = 3/3 ✓

### 1R.2 — Governance correctness (proposals)
- [x] TASK-08 — Proposal resolution authorization (maintainer / moderator, FR-12/FR-13)
  - Result: added `resolverUserId` to `ResolveProposalInput` + `RequestContext.userId`; new application helper `proposalAuthorization.ts` (`resolveTargetAuthorHash` resolves `nodes.authorHash`/`edges.authorHash`/`ontology_classes.proposedBy` and throws `ERR_NODE_NOT_FOUND`/`ERR_EDGE_NOT_FOUND`/`ERR_VALIDATION_FAILED` when the target is gone, `assertIsMaintainer` throws 403 `ERR_AUTHORIZATION_FAILED`); `Approve`/`RejectProposalUseCase` now resolve the target author and authorize before the state machine; new `AutoApplyProposalUseCase` (FR-13) requires `MODERATOR`/`ADMIN` via `membershipRepo.getRole`, calls `proposal.autoApply` (422 `ERR_UNMET_AUTO_APPLY_CRITERIA`), applies the NODE delta inside the UnitOfWork (polymorphic in TASK-09) and publishes `PROPOSAL_AUTO_APPLIED`; added `IOntologyRepository.findClassById` + Drizzle impl; new `PUT /api/v1/proposals/:id/auto-apply` behind `authGuard -> tenantWorkspaceGuard -> rateLimit`; wired `DrizzleEdgeRepository`/`DrizzleOntologyRepository` in `server.ts`. `pnpm turbo run build` = 3/3 ✓
- [x] TASK-09 — Polymorphic proposal application (EDGE + ONTOLOGY deltas, FR-10/FR-12)
  - Result: added `IEdgeRepository.applyDelta`/`DrizzleEdgeRepository.applyDelta` (fetch by `id`+`workspaceId`+not-deleted, throw `ERR_EDGE_NOT_FOUND`, merge `attributes` and update `relationKey` only when a string is supplied — whitelisted, no unknown jsonb keys) and `IOntologyRepository.applyClassDelta`/`activateClass` (+ Drizzle impl against `meta.ontology_classes`: whitelist `displayNames`/`descriptions`/`parentClassKey`, throw `ERR_VALIDATION_FAILED` if absent; `activateClass` loads the row, calls `OntologyClass.activate()` so a non-`PROPOSED` class surfaces `ERR_INVALID_STATE_TRANSITION`, then persists `ACTIVE`); extracted the shared `applyProposalDelta(repos, proposal, workspaceId, tid, tx)` helper in `ApproveProposalUseCase.ts` (NODE/EDGE/ONTOLOGY switch, ONTOLOGY = applyClassDelta + activateClass) and called it from both `Approve`/`AutoApplyProposalUseCase` inside the existing `uow.runInTransaction` so target mutation + `proposalRepo.updateStatus` commit atomically; `AutoApplyProposalUseCase` gained `edgeRepo`/`ontologyRepo` deps (wired in `server.ts`); post-commit event publication unchanged. `pnpm turbo run build` = 3/3 ✓

### 1R.3 — Domain vertical propagation (Edges / Ontology / Discussions / Votes / Nodes)
- [x] TASK-10 — Nodes vertical: controller consistency, read endpoints, cursor pagination, ontology validation (FR-06, NFR-04)
  - Result: added `INodeRepository.listByWorkspace` + `DrizzleNodeRepository` keyset impl (ORDER BY `created_at DESC, id DESC`, tuple `<` comparison, `LIMIT limit+1`, opaque base64 `"<iso>|<id>"` cursor encoded/decoded inside the adapter; malformed cursor → 422); new `ListNodeQuerySchema` (`limit` 1..100 default 20, optional `cursor`); new `GetNodeUseCase` (404 when null or foreign workspace) and `ListNodesUseCase`; `CreateNodeUseCase` now takes `IOntologyRepository` and rejects unknown/inactive `typeKey` with 422 `ERR_VALIDATION_FAILED` before persisting; refactored `NodeController` to `getRequestContext`/`sendError`/`mapDomainError` with `getNodeHandler`/`listNodesHandler` and a stable `NodeDto` (`authorHash` as string, ISO dates); wired `GET /api/v1/nodes` (`{ nodes, nextCursor }`) + `GET /api/v1/nodes/:id` (`{ node }`) in `routes.ts`/`server.ts`; `POST /api/v1/nodes` response shape unchanged. `pnpm turbo run build` = 3/3 ✓
- [x] TASK-11 — Subgraph endpoint `GET /api/v1/nodes/subgraph` (NFR-01)
  - Result: added `INodeRepository.getSubgraph(rootId, workspaceId, {depth, limit}, tid)` (+ `SubgraphEdge`/`SubgraphResult` types) and a Drizzle impl using a `WITH RECURSIVE reachable(id, depth)` CTE over `public.edges` followed in **both** directions (undirected neighbours), `UNION`-deduped with a `r.depth < depth` guard to terminate cycles; the ABI caps `depth` at 3 and `limit` at 200, filters `deleted_at IS NULL` on nodes+edges and scopes every branch to `workspace_id`; the CTE yields ordered de-duplicated ids (shallowest first) and nodes/edges are then loaded through the query builder so the existing `toDomain` mapper is reused (edges projected to `{id, sourceNodeId, targetNodeId, relationKey, status}`, never attributes/author). New `SubgraphQuerySchema` (`rootId` uuid, `depth` 0..3 default 1, `limit` 1..200 default 100) exported from `@vozlab/shared-types`; new `GetSubgraphUseCase` (404 `ERR_NODE_NOT_FOUND` when the root is missing or foreign); `NodeController.getSubgraphHandler` returns `{ nodes: NodeDto[], edges: [...] }` (authorHash as string, no embeddings); `GET /api/v1/nodes/subgraph` registered **before** `/api/v1/nodes/:id` behind `authGuard -> tenantWorkspaceGuard -> rateLimit`; wired in `server.ts`. `pnpm turbo run build` = 3/3 ✓
- [x] TASK-12 — Edges vertical: complete repository, use cases, controller, routes (FR-08)
  - Result: added `IEdgeRepository.listByWorkspace` + `update` and Drizzle impls (`DrizzleEdgeRepository` keyset pagination `ORDER BY created_at DESC, id DESC` with tuple `<` comparison, `LIMIT limit+1`, opaque base64 `"<iso>|<id>"` cursor encoded/decoded in the adapter, malformed cursor → 422; `update` mirrors the node adapter since `save` is insert-only); new `GetEdgeUseCase`/`ListEdgesUseCase` (404 when missing/foreign workspace) and `UpdateEdgeUseCase`/`DeleteEdgeUseCase` (author-only: `edge.authorHash.toString() !== authorHash` → 403 `ERR_AUTHORIZATION_FAILED`; update merges attributes + sets relationKey then `edgeRepo.update`; delete soft-deletes; both publish `EDGE_UPDATED`/`EDGE_DELETED` post-commit, best-effort); `EdgeController` gained `get`/`list`/`update`/`delete` handlers using `getRequestContext`/`sendError`/`mapDomainError` and a stable `EdgeDto` (authorHash as string, never the value object), bodies validated with `CreateEdgeSchema`/`UpdateEdgeSchema` and `ListNodeQuerySchema` for the query; registered `POST/GET /api/v1/edges`, `GET/PATCH/DELETE /api/v1/edges/:id` behind `authGuard -> tenantWorkspaceGuard -> rateLimit`; wired the edge repo + five use cases in `server.ts`/`routes.ts` (`RouteDependencies` extended). `CreateEdgeUseCase` already had full DI + `DomainError` (unchanged). `pnpm turbo run build` = 3/3 ✓
- [x] TASK-13 — Ontology vertical: datatype/object properties, activation, routes (FR-06/08/09)
  - Result: added `ProposeDatatypePropertyUseCase`/`ProposeObjectPropertyUseCase` (validate `domainClassKey` — and `rangeClassKey` for object properties — via `findClassByKey`, 422 `ERR_VALIDATION_FAILED`; build the entity in `PROPOSED`; `saveDatatypeProperty`/`saveObjectProperty`; publish `ONTOLOGY_PROPERTY_PROPOSED`), `ActivateOntologyClassUseCase` (resolves `resolverUserId` → `MODERATOR`/`ADMIN` via `membershipRepo.getRole`, else 403 `ERR_AUTHORIZATION_FAILED`; `findClassById` → 422 when absent; `cls.activate()` state machine; `activateClass` inside `UnitOfWork`; publish `ONTOLOGY_CLASS_ACTIVATED`) and `GetOntologyUseCase` (`findActiveClasses` + `findActiveObjectProperties`; proposals stay invisible). Rewrote `OntologyController` with `proposeClass`/`proposeDatatypeProperty`/`proposeObjectProperty`/`activateClass`/`getOntology` handlers on the shared `getRequestContext`/`sendError`/`mapDomainError` helpers + Zod schemas and stable DTOs; registered `POST /api/v1/ontology/{classes,datatype-properties,object-properties}`, `PUT /api/v1/ontology/classes/:id/activate`, `GET /api/v1/ontology` behind `authGuard -> tenantWorkspaceGuard -> rateLimit` and wired `OntologyController` + the 5 use cases in `routes.ts`/`server.ts`. Note: activation authorizes via `resolverUserId`+`getRole` (the task's `resolverRole` shorthand) — never trusts a client-supplied role. `pnpm turbo run build` = 3/3 ✓
- [x] TASK-14 — Discussions vertical: wire threads/posts + read endpoints (FR-11/FR-16)
  - Result: added `IDiscussionRepository.listThreads`/`listPosts` (keyset pagination, opaque base64 `"<iso>|<id>"` cursor encoded in the adapter, malformed → 422; threads `ORDER BY created_at DESC, id DESC` with tuple `<`, posts `ORDER BY created_at ASC, id ASC` with tuple `>` for a chronological read) + `updateThreadStatus`; `DrizzleDiscussionRepository` implements all three and drops the two unbounded finders; new `ListThreadsUseCase` (filters `workspaceId` + `targetId` + `targetType`), `ListPostsUseCase` (verifies the thread via `findThreadById`, else 404 `ERR_THREAD_NOT_FOUND`) and `CloseThreadUseCase` (creator-only via `createdByHash.toString() === authorHash` → 403 `ERR_AUTHORIZATION_FAILED`, else `thread.close()` + `updateThreadStatus` + post-commit `THREAD_CLOSED`); `DiscussionController` gained `listThreadsHandler`/`listPostsHandler`/`closeThreadHandler` with stable `ThreadDto`/`PostDto` (authorHash as string, ISO dates) and kept the existing POST response shapes; added `ListThreadsQuerySchema`/`ListPostsQuerySchema` to `@vozlab/shared-types`; registered the five `/api/v1/discussions` routes behind `authGuard -> tenantWorkspaceGuard -> rateLimit` and wired `DrizzleDiscussionRepository` + the five use cases in `server.ts`/`routes.ts` (`RouteDependencies` extended). `pnpm turbo run build` = 3/3 ✓
- [x] TASK-15 — Interactions/Votes vertical: wire votes, unify score updates (FR-14/FR-15)
  - Result: rewrote `DrizzleInteractionRepository.applyScoreDelta` so `POST` keeps `upvotes`/`downvotes`/`community_score` coherent (single `sql`-level `+=` update: `upvotes += (delta>0)`, `downvotes += (delta<0)`, `community_score += up-down`) and the `default` branch now throws `DomainError('ERR_VALIDATION_FAILED', ...)` instead of a plain `Error`; deleted the never-called `applyPostVote` from `IDiscussionRepository`/`DrizzleDiscussionRepository` so only one post-counter implementation remains (documented in `applyScoreDelta`); `CastVoteUseCase` already used `DomainError('ERR_DUPLICATE_INTERACTION')` (TASK-06). Wired the vertical end-to-end: `server.ts` instantiates `DrizzleInteractionRepository(poolManager)` + `CastVoteUseCase(interactionRepo, uow, eventPublisher)`, `RouteDependencies` gained `castVoteUseCase`, and `routes.ts` builds `InteractionController` and registers `POST /api/v1/interactions` behind `authGuard -> tenantWorkspaceGuard -> rateLimit`. `pnpm turbo run build` = 3/3 ✓
- [x] TASK-16 — shared-types alignment (error codes, batch-node schema, vote semantics)
  - Result: removed the misleading `value` field from `CastVoteSchema` and documented that the score delta is derived server-side from `interactionType` (Zod strips any stray `value`); `CreateNodeSchema.typeKey` now requires `.min(1)`; replaced all `z.record(z.any())` input usages with `z.record(z.unknown())` (node/edge/proposal schemas); added `batch.schema.ts` (`BatchCreateNodeSchema` = 1..1000 `CreateNodeSchema`, contract-only for the future Extractor worker) exported from `index.ts`; verified `ERR_UNMET_AUTO_APPLY_CRITERIA` (422) and `ERR_AUTHORIZATION_FAILED` (403) already present. `pnpm turbo run build` = 3/3 ✓
- [x] TASK-17 — Dev seed: provision tenant + base ontology in the router/tenant DBs
  - Result: added `packages/database/scripts/seed-dev.ts` (+ `db:seed:dev` script and `tsx` devDependency) — an idempotent dev-only seed (fixed UUIDs + `onConflictDoNothing()`, env `ROUTER_DB_*`/`TENANT_DB_*` with the drizzle defaults, pools closed in `finally`, clear non-zero exit when the DB is unreachable). Seeds the router tenant (`slug`/`oidc_tenant_id` = `sabana`, id `11111111-1111-4111-8111-111111111111`) + its `tenant_connections` row (`vozlab_tenant_dev`), and the tenant DB: workspace `general` (`33333333-3333-4333-8333-333333333333`), user `Dev Maintainer` (`44444444-4444-4444-8444-444444444444`, `authorHash` = sha256("dev-maintainer") = `1def18ae31049a4454a82b04b9903b36ef8534a70c4e6aa23eacf952b9fce58b`), an `ADMIN` membership, the ACTIVE classes `Problem`/`Idea`/`Resource`, datatype props `title`/`description` (domain `Problem`) and object prop `RELATES_TO` (`Problem`→`Idea`). Verified against the local migrated DB: run twice, counts stay 3/2/1/1/1/1; `select slug, oidc_tenant_id from tenants` → `sabana|sabana`; `select system_key, status from meta.ontology_classes` → Idea/Problem/Resource all ACTIVE. `pnpm turbo run build` = 3/3 ✓

## PHASE 1S: CONSOLIDATION, IDENTITY & DEV READINESS (complete)
> Post-Phase-1R review (`.claude/reviews/REVIEW-2026-10-17_phase-1r.md`): the verticals are real
> and the monorepo type-checks, but the API cannot boot (`ERR_PACKAGE_PATH_NOT_EXPORTED`), no one
> can obtain a token, and several cross-workspace / identity / soft-delete edges are open. This
> batch closes those gaps. Full milestone definitions in `EXECUTION_PLAN.md`.

### 1S.1 — Correctness & Bootstrap
- [x] TASK-18 — Fix API dev boot (`exports` conditions) + `.env.example` (H-3, L-7)
      → Added `require`/`default` export conditions to `@vozlab/database` & `@vozlab/shared-types`; created `.env.example`; `tsx src/index.ts` now reaches Zod env validation (exit 1), `pnpm turbo run build` 3/3.
- [x] TASK-22 — Cross-workspace isolation inside a tenant (H-4)
      → Scoped every id-addressed read/mutation to the request workspace, returning `ERR_*_NOT_FOUND` (404, never 403) on mismatch: `CreateEdgeUseCase` requires both endpoints in `input.workspaceId`; approve/reject/auto-apply compare `proposal.workspaceId` **before** any maintainer/role check; `CloseThreadUseCase` gained `workspaceId` and all three discussion use cases compare `thread.workspaceId`; `IOntologyRepository.findClassById`/`applyClassDelta`/`activateClass` now take `workspaceId` and filter on it (adapter `and(...)` + same not-found error), with every call site (`ActivateOntologyClassUseCase`, `proposalAuthorization.resolveTargetAuthorHash`, `applyProposalDelta`) passing it; `DiscussionController` now forwards `ctx.workspaceId` to close/list-posts. Added §6.6 to `docs/modules/modules_02_backend_fastify_guide.md` stating the rule. `grep` clean; `pnpm turbo run build` = 3/3 ✓
- [x] TASK-23 — Real proposal read endpoints (`GET /proposals[/:id]`) (H-1)
      → Added `ListProposalQuerySchema`/`ListProposalQueryInput` to `@vozlab/shared-types`; `IProposalRepository` gained `findByIdInWorkspace(id, workspaceId, tid)` and `findByWorkspace(workspaceId, {status?, targetType?, limit, cursor?}, tid)`, implemented in `DrizzleProposalRepository` with keyset paging (`createdAt DESC, id DESC`, TASK-24 helper, `limit + 1` → `nextCursor`); new `ListProposalsUseCase`/`GetProposalUseCase` (`null` → `ERR_PROPOSAL_NOT_FOUND` → 404, never 403); `ProposalController.list`/`.get` map to a stable DTO (pseudonyms emitted via `.toString()`, `proposedChanges` passed through) and return `{ proposals, nextCursor }` / `{ proposal }`; wired through `server.ts` + `RouteDependencies`; the two hard-coded empty payloads in `routes.ts` are deleted. `pnpm turbo run build` = 3/3 ✓
- [x] TASK-24 — De-duplicate cursor helpers + make soft-delete single-writer (M-5, M-6)
      → Added `infrastructure/persistence/keyset.ts` (single home for `encodeCursor`/`decodeCursor` + `keysetAfter(createdAtCol, idCol, decoded, 'asc'|'desc')`); `DrizzleNodeRepository`/`DrizzleEdgeRepository`/`DrizzleDiscussionRepository` now import it and the inline tuple-SQL is gone (cursor format unchanged: base64 `iso|id`, malformed → `ERR_VALIDATION_FAILED`; unused `sql` import dropped from the edge/discussion adapters). Removed `Edge.softDelete()` and its call in `DeleteEdgeUseCase`, so the adapter's `deletedAt: new Date()` is the only writer; `EDGE_DELETED` still publishes post-write. `grep "function encodeCursor|function decodeCursor"` hits exactly one file. `pnpm turbo run build` = 3/3 ✓. TASK-23/25 may now reuse `keyset.ts`.
- [x] TASK-30 — Infra error mapping (503 not 403) + graceful shutdown (M-2) — added `InfrastructureError`; `RouterDatabaseClient` throws instead of returning `null` on driver errors; guard maps infra failures to 503/500 and keeps 403 for genuine non-provisioned tenants; `index.ts` handles SIGTERM/SIGINT via `app.close()`; build 3/3.

### 1S.2 — Identity
- [x] TASK-19 — Dev identity bootstrap (multi-role seed + `mint-dev-token`) (H-5)
      → Added `scripts/dev-identities.ts` (frozen fixtures: maintainer/moderator/member/agent with fixed UUIDs, `sub` = `auth.users.id`, `authorHash` = sha256(`dev-<name>`), workspace UUID `33333333-3333-4333-8333-333333333333`) + `scripts/mint-dev-token.ts` (`--as <role>`, HS256 12h, claims `sub/tid=sabana/jti/authorHash` + `type` for the agent, refuses `JWT_SECRET` < 32 chars) and refactored `seed-dev.ts` to insert 4 users / 3 memberships via batch `onConflictDoNothing()` (ontology unchanged) + print a `role → sub → authorHash` table. Verified on the local migrated DB: seed run 3× stays 4 users / 3 memberships / 1 workspace / 3 classes; `--as moderator` yields a verifiable JWT with `tid=sabana` and `authorHash === sha256("dev-moderator")`; `--as agent` yields `type=AGENT_EXTRACTOR`. `pnpm turbo run build` = 3/3 ✓
- [x] TASK-20 — Author-hash hardening (configurable salt, no placeholders) (H-2, M-9)
      → Added required `AUTHOR_HASH_SALT` (≥16 chars) to `env.ts`/`.env.example`; new `application/services/resolveAuthorHash.ts` is the only salt reader (`fromRawOrIdentity(raw || subject, salt)`, preserved verbatim when a valid 64-hex `authorHash` is supplied); `AuthGuard` rejects tokens without `sub` (401 `ERR_INVALID_TOKEN`) and derives `authorHash` via the resolver (no `?? 'unknown'`); `getRequestContext` now requires `userId`+`authorHash` (no `'anonymous'`) and all 24 controller guards return 401 `ERR_INVALID_TOKEN`; the 9 `'default-salt'` sites call the resolver; added one sentence to `docs/system/system_04`. `grep 'default-salt'` clean; `pnpm turbo run build` = 3/3 ✓
- [x] TASK-21 — System-agent (AI worker) identity contract (FR-17, concern #1)
      → Added `AgentTypeSchema`/`AgentType` to `@vozlab/shared-types` (`schemas/agent.schema.ts`, exported from `index.ts`); `AuthGuard` now derives its allowlist from `AgentTypeSchema.options`, sets `req.isSystemAgent`/`req.agentType` for a valid `type`, and returns 401 `ERR_INVALID_TOKEN` for any non-allow-listed `type` (never downgraded to a human), with the deterministic `authorHash` derived via the TASK-20 resolver; `req.agentType` typed as `AgentType` in `fastify.d.ts`; `TenantWorkspaceGuard` comment documents the contract (agent must send `X-Workspace-ID`, `tid` must resolve, membership skipped); `dev-identities.ts` now imports `AgentType` from shared-types instead of restating the literals; `modules_02` §3.2 documents the claim table (`sub`/`tid`/`jti`/`authorHash`/`type`) and that agents use `POST /api/v1/nodes` + `POST /api/v1/proposals` (never direct DB writes), referenced from `system_02` US-07. `pnpm turbo run build` = 3/3 ✓

### 1S.3 — Policy
- [x] TASK-25 — Soft-delete policy: filter reads + node/post deletion + docs (M-1, M-7)
      → `DrizzleDiscussionRepository.listPosts` now filters `isNull(discussionPosts.deletedAt)` (M-1 leak closed) and gained `findPostById` (+`IDiscussionRepository` port); `INodeRepository.softDelete` implemented in `DrizzleNodeRepository` (adapter remains the single `deletedAt` writer). New `DeleteNodeUseCase`/`DeletePostUseCase` (author-only: 404 for missing/foreign-workspace/already-deleted, 403 for non-author; publish `NODE_DELETED`/`POST_DELETED` post-write). Routes `DELETE /api/v1/nodes/:id` + `DELETE /api/v1/discussions/posts/:id` (204) wired through `RouteDependencies`/`server.ts`. Added `ERR_POST_NOT_FOUND` (404) to `ERROR_CODES` + `DomainError` union. `docs/modules/modules_01` §2 now carries the per-entity soft-delete policy table (nodes/edges/posts = `deleted_at` + endpoint; threads/proposals/ontology = status; `interactions_log` = immutable). `pnpm turbo run build` = 3/3 ✓
- [x] TASK-26 — Rate limit per actor (M-3, concern #4)
      → `RateLimitingMiddleware` now enforces two fixed-window buckets: a per-`actor` key (`vozlab:ratelimit:{tenant}:{workspace}:{method}:{actor}`, evaluated first) and the coarse workspace key, with caps `getRateLimitMax(method)` and `getRateLimitMax(method) × RATE_LIMIT_WORKSPACE_MULTIPLIER`; shared `INCR`/conditional-`EXPIRE` logic extracted to a private `hit(key, limitMax)`; `rateLimitMiddleware` builds `actor = req.user?.authorHash ?? req.ip` (TASK-20 guarantees a real hash for authenticated/agent callers) and passes it through; `resetRateLimit` deletes both keys; warn logs keep `tenantId/workspaceId/method/limit` and add `actor`+`bucket`; fail-open guard and `catch` unchanged, `ERR_RATE_LIMIT_EXCEEDED` 429 shape unchanged. Added validated `RATE_LIMIT_WORKSPACE_MULTIPLIER` (`int().min(1)`, default 10) to `env.ts`/`.env.example`; `docs/system/system_01` NFR-08 reworded to per-actor bucket + workspace ceiling. `pnpm turbo run build` = 3/3 ✓
- [x] TASK-27 — Vote semantics: `VoteValue` VO + CQRS decision record (concern #10)
      → New pure `domain/value_objects/VoteValue.ts` is now the only `interactionType → delta` mapping (`DOWNVOTE → -1`, `UPVOTE|SUPPORT|VALIDATE → +1`); `CastVoteUseCase` dropped the inline ternary and computes `VoteValue.fromInteractionType(...)`. Added `IInteractionRepository.existsInWorkspace(targetId, targetType, workspaceId, tid)` + Drizzle impl (switch over `nodes`/`edges`/`editProposals`/`discussionPosts`, each `select({id}).limit(1)` filtered by id + workspace + `isNull(deletedAt)` where present; posts scoped via `discussionThreads` join, proposals have no `deletedAt`) — verified *before* the insert, so a missing/foreign-workspace/soft-deleted target throws the type-appropriate 404 (`ERR_NODE/EDGE/PROPOSAL/POST_NOT_FOUND`) and no interaction row is written; idempotency branch kept first. **Decision (CQRS): keep the synchronous atomic DB increment (FR-15) — the Redis-buffered `HINCRBY` + 60 s flush is deferred, tracked in `EXECUTION_PLAN.md`, not implemented piecewise.** Docs updated: `modules_01 §5` rewritten to the decision, `modules_02 §1` points at `VoteValue.ts` + states the mapping and server-derived rule. `pnpm turbo run build` = 3/3 ✓
- [x] TASK-28 — Typed enums at the boundaries (L-1, concern #6)
      → Added `WorkspaceRoleSchema`/`SystemRoleSchema` + `isModeratorOrAdmin(role)` to `@vozlab/shared-types` (`schemas/roles.schema.ts`, exported from `index.ts`); `IMembershipRepository` now re-exports the derived `WorkspaceRole` (local union deleted) so call sites are unchanged, and `AutoApplyProposalUseCase`/`ActivateOntologyClassUseCase` use `isModeratorOrAdmin` (no restated literals); `RateLimitingMiddleware` hoists `WRITE_METHODS` and tests it via `(WRITE_METHODS as readonly string[]).includes(...)`; new `shared/assertNever.ts` (plain `Error`, not a `DomainError`, hence not in `domain/`); `ApproveProposalUseCase.applyProposalDelta` default is now `return assertNever(proposal.targetType, ...)`; `DrizzleInteractionRepository.applyScoreDelta` validates the untyped `string` with `InteractionTargetTypeSchema.safeParse` (bad DB value still throws `ERR_VALIDATION_FAILED`) then switches on the narrowed union with a `assertNever` default; `AuthGuard` already derives its allowlist from `AgentTypeSchema.options` (no literal set). `pnpm turbo run build` = 3/3 ✓
- [x] TASK-29 — Bound the subgraph CTE + index tuning + Apache AGE decision (M-4, concern #7)
      → **Found & fixed a latent bug:** the shipped two-branch CTE could never parse on PostgreSQL
      (verified against PG 18.6): both branches self-referenced `reachable`, but `parse_cte.c`
      allows **exactly one** self-reference and only in the right-hand operand of the top-level
      `UNION` → `recursive reference ... must not appear within its non-recursive term`. The
      rewritten CTE keeps one self-reference: the two edge directions are enumerated in a single
      `JOIN LATERAL` union inside **one** parenthesized recursive term, so it now runs. **Row
      bounding:** each direction branch carries `LIMIT ${limit}` and the whole recursive step
      carries `LIMIT ${limit}` (the outer `LIMIT ${limit}` is kept); `UNION`/`depth ≤ 3` unchanged,
      so the working table is `O(limit · depth)`. **Indexes:** `tenant.public.schema.ts` swaps
      `idx_edges_source`/`idx_edges_target` for workspace-covering partial indexes
      `idx_edges_workspace_source (workspace_id, source_node_id) WHERE deleted_at IS NULL` and
      `idx_edges_workspace_target (workspace_id, target_node_id) WHERE deleted_at IS NULL`;
      generated `migrations/tenant/0001_demonic_tomas.sql` = 2 `DROP INDEX` + 2 `CREATE INDEX`,
      non-destructive (nodes indexes untouched). **EXPLAIN ANALYZE** (5000 nodes / 20000 edges,
      real PG 18.6): `Index Scan using idx_edges_workspace_source on edges e` +
      `Index Scan using idx_edges_workspace_target on edges e_1` inside the `Recursive Union`,
      **no `Seq Scan on edges`**; the query also matches a reference BFS exactly (both directions,
      dedup, workspace + `deleted_at` filters) and a 3000-out-edge hub returns exactly 200 rows at
      `limit=200`. Docs `modules_01 §4` and `EXECUTION_PLAN.md` (Deferred) record the **AGE
      decision: keep the bounded SQL CTE for the read path; Apache AGE/Cypher is its own deferred
      milestone (mirroring + reconciliation + backfill), not implemented piecewise.**
      `pnpm turbo run build` = 3/3 ✓

### 1S.4 — Quality
- [x] TASK-31 — Vitest domain baseline (M-10, seeds Phase 4.1) — **done:** added `apps/api/vitest.config.ts` (a `nodeNextJsToTs` Vite plugin resolving NodeNext `./x.js` specifiers to `./x.ts`) and `apps/api/tests/` (6 files / 19 tests: Node, Edge, EditProposal, AuthorHash, keyset, CloseThreadUseCase). Pure unit tests with in-memory fakes — no DB/Redis/network. `pnpm --filter @vozlab/api test` = 6 files / 19 tests ✓; `pnpm turbo run build` = 3/3 ✓ (tests live outside `src/**`, so `tsc` does not type-check them — no tsconfig change needed). CI (Phase 4) can now run `test` as a Turbo task.

**Suggested wave order:** `18 → (19, 22, 23, 24, 30) → (20, 25, 26) → (21, 27, 28, 29) → 31`.

## PHASE 1T: DEV ERGONOMICS, LAYERING & INGESTION CONTRACT (current batch)
> Post-Phase-1S review (`.claude/reviews/REVIEW-2026-10-17_phase-1s.md`): all 14 tasks landed and
> the verticals/identity/isolation work is real, but the documented dev workflow still cannot boot
> (`.env` is never loaded), the author-hash salt is deployment-global and not rotatable, the AI
> worker → workspace mapping does not exist, and timestamp ownership is split between domain and
> adapter. This batch closes those seams. Full milestone definitions in `EXECUTION_PLAN.md`.

### 1T.1 — Correctness & Bootstrap
- [x] TASK-32 — Load `.env` in `dev`/`start`
      → Result: loaded root `.env` via `tsx --env-file-if-exists=../../.env` in `@vozlab/api` (`dev`, `start`) and `@vozlab/database` (`db:seed:dev`, `db:mint-token`); updated `.env.example` header and `docs/devops/devops_01`. `pnpm turbo run build` = 3/3 ✓
- [x] TASK-33 — Validate the proposal target on creation (workspace + existence)
      → Result: validated proposal target via reuse shape (a) using IInteractionRepository.existsInWorkspace (NODE/EDGE) and IOntologyRepository.findClassById (ONTOLOGY), throwing 404 ERR_NODE_NOT_FOUND, ERR_EDGE_NOT_FOUND, or ERR_VALIDATION_FAILED before persisting; added unit tests. pnpm turbo run build = 3/3 ✓
- [ ] TASK-34 — Request-context error consistency (`ERR_INVALID_TOKEN`)
- [ ] TASK-35 — Workspace-scope proposal target-author resolution
- [ ] TASK-36 — Tenant DB config null-vs-throw contract + caller audit

### 1T.2 — Identity & Secrets
- [ ] TASK-37 — Author-hash salt: per-tenant model, production guard, rotation runbook

### 1T.3 — Layering & Vocabulary
- [ ] TASK-38 — Timestamp ownership (domain `created/updated`, adapter `deleted_at`)
- [ ] TASK-39 — Port/adapter naming convention + bounded renames
- [ ] TASK-40 — Remove domain placeholder defaults + de-duplicate dev role types

### 1T.4 — Ingestion Contract (Phase 2 prep)
- [ ] TASK-41 — Data-source → workspace mapping: decision + shared-types contract
- [ ] TASK-42 — Fix the Extractor spec drift (`modules_05`)

### 1T.5 — Type Safety & Quality
- [ ] TASK-43 — Type the transaction handle (`tx?: any` → `DbTransaction`)
- [ ] TASK-44 — Use-case test baseline (application layer, fakes only)
- [ ] TASK-45 — Wire the `test` task (root script + Turbo outputs warning)

**Suggested wave order:** `(32, 33, 36, 41) → (34, 35, 37, 38) → (39, 42) → (40, 43) → (44, 45)`.

## PHASE 2: PYTHON AI WORKERS
- [ ] MILESTONE-2.1 to MILESTONE-2.6 (Extractor and Relator)
- [ ] MILESTONE-2.7 Consolidator (planned — missing from the original plan; see EXECUTION_PLAN.md)

## PHASE 3: SVELTEKIT 5 PWA FRONTEND (`apps/web`)
- [ ] MILESTONE-3.1 to MILESTONE-3.5

## PHASE 4: CI/CD, OBSERVABILITY AND AUTOMATED QA
- [ ] MILESTONE-4.1 to MILESTONE-4.5
