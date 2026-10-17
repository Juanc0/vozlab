# Active Task Board (VozLab)

> **Atomic task prompts:** `.claude/tasks/TASK-NN_*.md` — one self-contained prompt per
> vertical slice. The current batch is **Phase 1S** (consolidation, identity & dev readiness,
> TASK-18…31); Phase 1R (TASK-01…17) is complete. Both are defined in `EXECUTION_PLAN.md`.
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

## PHASE 1S: CONSOLIDATION, IDENTITY & DEV READINESS (current batch)
> Post-Phase-1R review (`.claude/reviews/REVIEW-2026-10-17_phase-1r.md`): the verticals are real
> and the monorepo type-checks, but the API cannot boot (`ERR_PACKAGE_PATH_NOT_EXPORTED`), no one
> can obtain a token, and several cross-workspace / identity / soft-delete edges are open. This
> batch closes those gaps. Full milestone definitions in `EXECUTION_PLAN.md`.

### 1S.1 — Correctness & Bootstrap
- [ ] TASK-18 — Fix API dev boot (`exports` conditions) + `.env.example` (H-3, L-7)
- [ ] TASK-22 — Cross-workspace isolation inside a tenant (H-4)
- [ ] TASK-23 — Real proposal read endpoints (`GET /proposals[/:id]`) (H-1)
- [ ] TASK-24 — De-duplicate cursor helpers + make soft-delete single-writer (M-5, M-6)
- [ ] TASK-30 — Infra error mapping (503 not 403) + graceful shutdown (M-2)

### 1S.2 — Identity
- [ ] TASK-19 — Dev identity bootstrap (multi-role seed + `mint-dev-token`) (H-5)
- [ ] TASK-20 — Author-hash hardening (configurable salt, no placeholders) (H-2, M-9)
- [ ] TASK-21 — System-agent (AI worker) identity contract (FR-17, concern #1)

### 1S.3 — Policy
- [ ] TASK-25 — Soft-delete policy: filter reads + node/post deletion + docs (M-1, M-7)
- [ ] TASK-26 — Rate limit per actor (M-3, concern #4)
- [ ] TASK-27 — Vote semantics: `VoteValue` VO + CQRS decision record (concern #10)
- [ ] TASK-28 — Typed enums at the boundaries (L-1, concern #6)
- [ ] TASK-29 — Bound the subgraph CTE + index tuning + Apache AGE decision (M-4, concern #7)

### 1S.4 — Quality
- [ ] TASK-31 — Vitest domain baseline (M-10, seeds Phase 4.1)

**Suggested wave order:** `18 → (19, 22, 23, 24, 30) → (20, 25, 26) → (21, 27, 28, 29) → 31`.

## PHASE 2: PYTHON AI WORKERS
- [ ] MILESTONE-2.1 to MILESTONE-2.6 (Extractor and Relator)
- [ ] MILESTONE-2.7 Consolidator (planned — missing from the original plan; see EXECUTION_PLAN.md)

## PHASE 3: SVELTEKIT 5 PWA FRONTEND (`apps/web`)
- [ ] MILESTONE-3.1 to MILESTONE-3.5

## PHASE 4: CI/CD, OBSERVABILITY AND AUTOMATED QA
- [ ] MILESTONE-4.1 to MILESTONE-4.5
