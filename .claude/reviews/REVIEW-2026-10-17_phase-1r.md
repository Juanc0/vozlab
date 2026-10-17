# Phase 1R Review — Results, Cross-Cutting Findings & Next-Batch Plan

> **Date:** 2026-10-17 · **Scope:** TASK-01 … TASK-17 (Phase 1R) + fresh code vs `/docs` audit
> **Method:** every task's acceptance criteria read from `.claude/tasks/TASK-NN_*.md` and
> checked against the code at `HEAD` (commit `0e7631e` + uncommitted TASK-17 work).
> `pnpm turbo run build` → **3/3 successful** (type-check only; no JS emitted).
> **No source code was changed.** Only this report, `.claude/tasks/*`, `TODO.md`,
> `EXECUTION_PLAN.md` were created/edited.

## 0. Verdict at a glance

**Phase 1R is ~90% delivered.** All 17 tasks are implemented at the code level and the
monorepo type-checks. The verticals (edges / ontology / discussions / interactions) are wired
and real. The remaining problems are **integration and policy gaps**, not missing verticals:
the API cannot be booted for real use, a caller cannot obtain a token, and several
cross-workspace / soft-delete / identity edges are still open.

`TODO.md` lists all 17 as `[x]`; three of those claims are **optimistic** and are corrected below.

## 1. Per-task verdicts

| # | Task | Verdict | Evidence / note |
| --- | --- | --- | --- |
| 01 | Repo hygiene & governance sync | ⚠️ **Partial** | `.gitignore`, root dupes, `turbo.json` ✅. **AC "`pnpm-workspace.yaml` has no `allowBuilds`" is FALSE at HEAD**: the key is back (`allowBuilds: esbuild: true`, re-added by the turbo-upgrade commit `262ef7c`). Drifted since the result note. |
| 02 | Reset + regenerate migrations | ✅ | Single `0000_*` per DB. Tenant SQL has `edges."attributes" jsonb`, `vector(768)`, HNSW/GIN/partial indexes; router = only `tenants` + `tenant_connections`. |
| 03 | `reqId` via AsyncLocalStorage | ✅ (unverified at runtime) | `bindReqId` + `enterWith`; `req.log` uses `requestIdLogLabel: 'reqId'`. Runtime check blocked by H-3 (cannot boot). |
| 04 | Real `/health/ready` | ✅ | `IRouterDatabase.ping()` + `RedisTokenBlacklist.ping()`; 503 shape correct. |
| 05 | Workspace membership in guard | ✅ | Port + `DrizzleMembershipRepository` + guard + wiring. Membership is re-queried per request (docs say the Redis cache is optional). |
| 06 | Typed `DomainError` + HTTP mapping | ✅ | No `throw new Error('ERR_` remains; `mapDomainError` uses `instanceof`. `ERR_VALIDATION_FAILED` is now overloaded for many distinct failures (verbose but not a bug). |
| 07 | Rate limiter fixed window | ✅ | `INCR` + conditional `EXPIRE`; 429 + fail-open preserved. |
| 08 | Proposal resolution authorization | ✅ (with caveat) | Maintainer-only + moderator auto-apply. **Caveat:** the proposal's `workspaceId` is never compared to the request workspace (H-4). |
| 09 | Polymorphic proposal application | ✅ | NODE/EDGE/ONTOLOGY deltas inside one `UnitOfWork`. **Caveat:** ontology `applyClassDelta`/`activateClass` are not workspace-scoped. |
| 10 | Nodes vertical | ✅ (minor) | Reads + keyset pagination + ontology validation. **Minor:** `POST /nodes` 201 body is a different shape from `NodeDto`. |
| 11 | Subgraph endpoint | ✅ (with caveat) | Recursive CTE, both directions, soft-delete filters, 404 on foreign root, route ordered before `/nodes/:id`. **Caveat:** the CTE is bounded by *depth* only, not by rows; AGE is not used (M-4, concern #7). |
| 12 | Edges vertical | ✅ (with caveat) | 5 routes + repo/use cases/repo wired. **Caveat:** `CreateEdgeUseCase` never checks that both nodes belong to the request workspace (H-4). |
| 13 | Ontology vertical | ✅ (with caveat) | 5 routes, property proposals, activation via `resolverUserId` + `getRole`. **Caveat:** class lookups/mutations are not workspace-scoped. |
| 14 | Discussions vertical | ✅ (with caveat) | 5 routes, pagination, creator-only close. **Caveat:** `listPosts` returns **soft-deleted** posts (M-1); thread operations have no workspace check. |
| 15 | Interactions / votes | ✅ (with caveat) | Wired + unified POST counter. **Caveat:** the target is not verified to exist / belong to the workspace before the score update (M-8). |
| 16 | shared-types alignment | ✅ (minor) | `value` removed from `CastVoteSchema`; batch schema; `z.unknown()`. **Minor:** `UpdateNodeSchema`, `ResolveProposalSchema`, `ProposalStatusSchema` are exported but unused. |
| 17 | Dev seed tenant + ontology | ⚠️ **Uncommitted & unverified E2E** | `scripts/seed-dev.ts` is present but **not committed**; AC #2/#3 need a running API, which is blocked by H-3. Handoff notes #1/#2 below. |

## 2. Cross-cutting findings (severity-ranked)

### High
- **H-1 — "No hard-coded empty payloads" is violated.** `EXECUTION_PLAN.md` MILESTONE-1R.3
  AC and TASK-10's DTO work both assume real reads, but `routes.ts` still returns
  `{ proposals: [] }` and `{ proposal: null }` for `GET /api/v1/proposals[/:id]`.
  `IProposalRepository` has no `findByWorkspace`/listing method, so this is genuinely unimplemented.
- **H-2 — Author identity collapses to one hash.** `AuthGuard` sets
  `authorHash: payload.authorHash ?? 'unknown'`; `getRequestContext` falls back to
  `'anonymous'`; and 9 call sites use the literal salt `'default-salt'`. A token without an
  `authorHash` claim therefore maps every caller to the **same** derived hash — breaking
  maintainer-only approval (FR-12), the `unique_user_target_vote` uniqueness (FR-14) and
  pseudonymity (NFR-07).
- **H-3 — The API cannot boot for local dev.** `pnpm --filter @vozlab/api dev` fails with
  `ERR_PACKAGE_PATH_NOT_EXPORTED`: `@vozlab/database`/`@vozlab/shared-types` declare only
  `types` + `import` in `exports`, while `apps/api` has no `"type": "module"` so `tsx` loads it
  as CJS. Reproduced with `node -e "require.resolve('@vozlab/database')"`.
- **H-4 — Cross-workspace holes inside a tenant.** Physical isolation is per **tenant**, not per
  **workspace**. Nothing stops, inside the same tenant: creating an edge between nodes of two
  different workspaces (`CreateEdgeUseCase`), approving a proposal whose `workspaceId` differs
  from the request workspace, posting to / closing / listing a thread of another workspace
  (`findThreadById` is id-only, `CloseThreadUseCase` has no `workspaceId`), or mutating a class
  of another workspace (`applyClassDelta`, `activateClass`, `findClassById`).
- **H-5 — No way to get a token.** There is no `/auth/*` endpoint and no dev token tool, so
  TASK-17's E2E acceptance and any manual test are impossible. Related: no `.env.example`.

### Medium
- **M-1** `DrizzleDiscussionRepository.listPosts` filters by `threadId` only → soft-deleted posts leak.
- **M-2** `RouterDatabaseClient.findTenantByOidcId` swallows DB errors and returns `null` → a
  Postgres outage answers **403 ERR_TENANT_NOT_PROVISIONED**, not a 503.
- **M-3** Rate-limit key is `tenant:workspace:method` — the whole workspace shares one bucket,
  so one actor can lock out everyone. `docs/system/system_01` NFR-08 says *per IP/Tenant*.
- **M-4** Subgraph recursive CTE unbounded by row-count; recursive `LIMIT` is absent and
  `idx_edges_source`/`idx_edges_target` are single-column (no `workspace_id`).
- **M-5** `encodeCursor`/`decodeCursor` duplicated verbatim in 3 repositories; the whole
  `listByWorkspace` keyset body is copy-pasted 3×.
- **M-6** Soft-delete is written twice: `edge.softDelete()` sets `deletedAt`, then
  `edgeRepo.softDelete()` writes a **second, different** `new Date()`. The domain value is dead.
- **M-7** Soft-delete coverage is inconsistent: `nodes`/`edges`/`discussion_posts` have
  `deleted_at`; `edit_proposals`, `discussion_threads`, `meta.*` do not; and there is **no**
  endpoint to soft-delete a node or a post (edges only). `docs/modules/modules_01 §2` says
  "All main tables implement logical deletion".
- **M-8** `CastVoteUseCase` never verifies the target exists / belongs to the workspace; the
  interaction row is inserted and `applyScoreDelta` silently updates 0 rows.
- **M-9** `'default-salt'` is hardcoded; NFR-07 requires an *institutional* salt from config.
- **M-10** No tests exist (`apps/api/tests/` and `vitest.config.*` are absent) although
  `vitest` is installed and Phase 4.1 depends on them.
- **M-11** `tx?: any` is the transaction type across all ports (docs MILESTONE-1.3 AC expects a
  real `tx`); type-safety debt, deferred.
- **M-12** `edit_proposals.target_id` has no FK (polymorphic by design) → orphaned proposals not
  prevented; `ontology_classes` has **no unique constraint** on `(workspace_id, system_key)`
  (only an index), so `findClassByKey`↔`ProposeOntologyClassUseCase` has a TOCTOU race.

### Low
- **L-1** Magic strings in `switch`/`if` boundaries (concern #6): `applyScoreDelta` switch,
  `resolveTargetAuthorHash`/`applyProposalDelta` switches, `AGENT_TYPES`, `getRateLimitMax`,
  `role !== 'MODERATOR' && role !== 'ADMIN'`.
- **L-2** `allowBuilds` drift (see TASK-01).
- **L-3** `apps/api` `start` points at `dist/index.js`, which is never produced (`build` = `tsc --noEmit`).
- **L-4** Unused exported schemas (`UpdateNodeSchema`, `ResolveProposalSchema`, `ProposalStatusSchema`).
- **L-5** `POST /nodes` 201 shape ≠ `NodeDto`.
- **L-6** `migrations/{router,tenant}/meta/` snapshot folders still exist (the TASK-02 wording
  "no files remain" really means "no old migration sets").
- **L-7** No `.env.example` (needed now that `dev` is fixable).
- **L-8** `Record<string, any>` in entity attributes (domain has `any`).

## 3. Docs ↔ code drift found in this pass

1. **`docs/system/system_04` §1** describes an HTTP-Only cookie `vozlab_session`; the code
   (and the Phase-1R decision) uses **Bearer JWT**. Docs must be updated.
2. **Vote scoring is self-contradictory in the docs:**
   `docs/modules/modules_01 §5` says votes are buffered in Redis (`HINCRBY vozlab:scores:{id}`)
   and flushed every 60 s (CQRS); `FR-15`/`US-04 AC#2` say the counters are updated *atomically
   in the DB*. The code implements the latter. A decision record is required.
3. **`docs/modules/modules_02 §1`** lists `domain/value_objects/VoteValue.ts`,
   `infrastructure/identity/` and `infrastructure/persistence/repositories/AgeGraphRepository.ts`
   — none exist. The `interactions_log.value` column and `vote_value` (system_03) exist and are
   server-derived (see concern #10).
4. **`FR-10`/`US-08`** expect the Relator to "create an Edge in `PROPOSED` status", but
   `EdgeStatus` is `DRAFT|PENDING|ACTIVE|REJECTED` (no `PROPOSED`) and `edit_proposals` targets
   *existing* objects — there is no "suggest a new edge" proposal shape.
5. **`docs`** pins PG 16 / drizzle-orm 0.34 / drizzle-kit 0.25; the repo is PG 18 / 0.45.4 / 0.31.11
   (already known — trust `package.json` + `docker/`).

## 4. Answers to the collected concerns

### #1 — AI workers must identify themselves to the API
They already can, structurally: `AuthGuard` reads the `type` claim, matches
`AGENT_EXTRACTOR|AGENT_RELACIONADOR|AGENT_CONSOLIDADOR`, sets `req.isSystemAgent`, and
`TenantWorkspaceGuard` then skips the membership lookup. What is **missing** is the contract and
the plumbing: (a) nothing issues an agent JWT, (b) an agent token without an `authorHash` claim
falls into the H-2 collision, (c) the `type` allowlist lives only in `AuthGuard` (not shared with
the docs/seed/workers), and (d) there is no `SYSTEM_AGENT` seed row. → **TASK-21.**
Recommendation: agents present a JWT whose `type` is an allow-listed value **and** a dedicated
`authorHash` (per-agent, deterministic), plus `tid`. Workers then call the *same* REST endpoints
as humans (`POST /nodes`, `POST /proposals`), per `US-07`.

### #2 — Why not GraphQL?
Because it is not in the specification (`/docs` mandates *Fastify + REST + Zod* + a per-request
`X-Workspace-ID` header — see `system_04 §2.2`), and because it would *cost* rather than save
here: the hard requirements are per-request tenant/workspace isolation and O(1) reads, which REST
already expresses; GraphQL would add one endpoint that has to re-implement the guard chain
per-field, plus N+1 hazards on the graph view and a subscription transport that duplicates the
planned SSE channel. GraphQL is **not** "not applicable" — it is simply not chosen, and nothing
in the current design blocks adding a thin read-only GraphQL facade later if query flexibility
becomes the bottleneck. **No task.** If you want it, it is a new milestone (schema SDL + resolvers
reusing the use cases), not a refactor.

### #3 — Dev login with multiple users, without the Sabana OIDC
This is the real blocker (H-5) and the answer is two-layered:
- **Now (dev-only):** a seed that provisions several users/roles (`ADMIN`, `MODERATOR`, `MEMBER`,
  and an agent) + a `mint-dev-token` script that signs a HS256 JWT with `JWT_SECRET` carrying
  `sub`, `tid: "sabana"`, `jti`, `authorHash`. This unblocks everything and needs no IdP. → **TASK-19.**
- **Later (the real thing):** `/auth/login` (302 to the IdP), `/auth/callback` (code→token,
  upsert `auth.users`, issue the session) and `/auth/logout` (blacklist `jti`). **External
  collaborators / non-institutional attendees** are exactly what `FR-03` already specifies:
  an `event_code`-gated anonymous session (`/auth/event-join`) with a pseudonym + reconnection
  token — no Google/uni account required. That whole flow needs the `event_codes` table and is
  **big**; it is kept as a tracked deferred milestone, not in this batch.

### #4 — Why isn't the rate limiter keyed by user?
You are right that the current key (`tenant:workspace:method`) protects the *tenant*, not a
*caller*: one member can exhaust the write bucket and lock out every colleague. NFR-08 literally
says "per IP/Tenant", so the code satisfies the letter of the spec but not its intent. Fix:
add an **actor** dimension — `authorHash` when authenticated, `req.ip` for anonymous/agent —
while keeping a coarse tenant/workspace ceiling. → **TASK-26.**

### #5 — Which entities get soft-delete?
`docs/modules/modules_01 §2`: "**All main tables** implement logical deletion … to prevent
entity deletion from breaking relationships or associated edit proposals." Concretely:
| Table | current | recommended |
| --- | --- | --- |
| `public.nodes` | has `deleted_at`, **no endpoint** | keep + `DELETE /nodes/:id` (author-only) |
| `public.edges` | has + endpoint | keep |
| `public.edit_proposals` | none | add `deleted_at`? **No** — proposals are immutable governance records; they end via status. Document that. |
| `social.discussion_threads` | none | add `deleted_at` + `DELETE` (creator/moderator) or document status-only |
| `social.discussion_posts` | has, **not filtered on read** | filter + `DELETE /discussions/posts/:id` |
| `meta.ontology_classes` / `properties` | none | keep status-based (`REJECTED`), *not* `deleted_at` — nodes validate against active keys |
| `public.interactions_log` | none | **never** soft-delete (immutable log, FR-14) |
Decision belongs in the docs; implementation is **TASK-25.**

### #6 — Prefer enums/unions over plain-text comparisons
Agreed, with a nuance: TypeScript already narrows the *typed* unions in most places
(`DomainErrorCode`, `ProposalStatus`, `OntologyStatus`), so the risk is concentrated where a
`string` crosses a boundary. The real offenders are: the two `switch`es keyed on
`proposal.targetType`/`targetType`, the `applyScoreDelta` switch on `targetType`, the
`AGENT_TYPES` `Set<string>`, `getRateLimitMax(method: string)`, and the role checks
(`role !== 'MODERATOR' && role !== 'ADMIN'`). Best practice: declare the enum **once** in
`@vozlab/shared-types` (Zod `z.enum` already exists for most of them) and consume the derived
union in the domain/infrastructure instead of restating string literals. → **TASK-28.**

### #7 — Is `getSubgraph` too complicated? Should it be Cypher/AGE?
Two separate issues:
- **Complexity is justified but under-hardened.** A recursive CTE is the standard SQL answer for
  a bounded undirected traversal and avoids dual-write; but the CTE is bounded by `depth` only,
  not by rows, and the traversal indexes are single-column. Resource risk is real on dense graphs.
  → **TASK-29** bounds it and adds `(workspace_id, source_node_id)`/`(workspace_id, target_node_id)`
  indexes + an `EXPLAIN ANALYZE` verification.
- **AGE/Cypher is specified** (`docs/00`, `modules_01 §4`) and **not implemented** (the
  `vozlab_graph` graph + labels are created by `scripts/02-extensions-and-graph.sql`, but nothing
  mirrors nodes/edges into it and no adapter issues Cypher). Adding it means dual-write (or an
  outbox) + backfill + a second source of truth. **Recommendation: keep the SQL CTE for the
  read path now, and schedule AGE as its own milestone** (mirroring + Cypher traversal +
  reconciliation) rather than folding it into a bug-fix batch. The task records the decision.

### #8 + #9 — Duplicated `softDelete` and duplicated `encodeCursor`/`decodeCursor`
Both are real and confirmed:
- `DeleteEdgeUseCase` calls `edge.softDelete()` **and** `edgeRepo.softDelete()`; the adapter's
  `new Date()` is what persists, so the domain call is dead code (and the two timestamps differ).
- `encodeCursor`/`decodeCursor` are duplicated verbatim in `DrizzleNodeRepository`,
  `DrizzleEdgeRepository` and `DrizzleDiscussionRepository`.
→ **TASK-24** extracts one `keyset` helper in infrastructure, replaces the 3 copies, and makes
the repository the **single** writer of `deleted_at`.

### #10 — Why did we stop sending a vote with a value?
We didn't stop *storing* one: `interactions_log.value` still exists and is persisted; TASK-16
only removed `value` from the **request** body and derives it server-side from `interactionType`
(`DOWNVOTE → -1`, otherwise `+1`) — which is the right call, since a client-supplied score is a
trust hole (a client could send `value: 999` or vote `UPVOTE` with `value: -1`). What is now
inconsistent is the **vocabulary**: `docs/modules/modules_02 §1` names a `VoteValue.ts` value
object that no longer exists, and `SUPPORT`/`VALIDATE` are silently scored as `+1` like `UPVOTE`.
→ **TASK-27** introduces a `VoteValue` domain value object as the single mapping
(`interactionType → value`), keeps the derived-value rule, and writes the CQRS decision record.
Bigger open question: the Redis-buffered CQRS scoring in `modules_01 §5` vs the synchronous
atomic increment in FR-15 — the task **decides and documents** (recommended: keep synchronous now,
track CQRS as deferred).

## 5. TASK-17 handoff notes

1. **"`GET /api/v1/ontology` wasn't exercised."** Correct and expected — the guard chain needs a
   live Redis + full env. Once H-3 (TASK-18) and H-5 (TASK-19) are solved the E2E acceptance can
   actually run; until then AC #2/#3 stay unverified. Not a TASK-17 defect.
2. **"`tsx src/index.ts` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`."** Reproduced and diagnosed:
   workspace packages expose only `types` + `import`; `apps/api` is CJS (no `"type": "module"`),
   so `require('@vozlab/database')` has no matching export condition. → **TASK-18** (small, high
   priority: it blocks every manual verification).

## 6. Proposed next batch — **PHASE 1S: Consolidation, Identity & Dev Readiness**

Dependency order (each task is atomic and self-contained, in the TASK-01…17 style):

| # | File | Group | Closes |
| --- | --- | --- | --- |
| 18 | `TASK-18_api-dev-boot-and-env-example.md` | 1S.1 Bootstrap | H-3, handoff #2, L-7 |
| 19 | `TASK-19_dev-identity-bootstrap.md` | 1S.2 Identity | H-5, concern #3 |
| 20 | `TASK-20_author-hash-hardening.md` | 1S.2 Identity | H-2, M-9, NFR-07 |
| 21 | `TASK-21_system-agent-identity-contract.md` | 1S.2 Identity | concern #1, FR-17 |
| 22 | `TASK-22_cross-workspace-isolation.md` | 1S.1 Correctness | H-4 |
| 23 | `TASK-23_proposal-read-endpoints.md` | 1S.1 Correctness | H-1, MILESTONE-1R.3 AC |
| 24 | `TASK-24_keyset-and-softdelete-deduplication.md` | 1S.1 Correctness | M-5, M-6, concerns #8/#9 |
| 25 | `TASK-25_soft-delete-policy.md` | 1S.3 Policy | M-1, M-7, concern #5 |
| 26 | `TASK-26_rate-limit-per-actor.md` | 1S.3 Policy | M-3, concern #4 |
| 27 | `TASK-27_vote-semantics-alignment.md` | 1S.3 Policy | concern #10, docs drift #2 |
| 28 | `TASK-28_typed-enums-at-boundaries.md` | 1S.3 Policy | L-1, concern #6 |
| 29 | `TASK-29_subgraph-bounding-and-age-decision.md` | 1S.3 Policy | M-4, concern #7 |
| 30 | `TASK-30_infra-error-mapping-and-shutdown.md` | 1S.1 Correctness | M-2 |
| 31 | `TASK-31_vitest-domain-baseline.md` | 1S.4 Quality | M-10, MILESTONE-4.1 seed |

**Suggested waves**
`18 → (19, 22, 23, 24, 30) → (20, 25, 26) → (21, 27, 28, 29) → 31`.
TASK-19 unblocks manual verification of everything else; TASK-18 unblocks TASK-19's runtime check.

**Kept deferred (tracked, unchanged):** OIDC `/auth/login|callback|logout` + `event_codes` +
`/auth/event-join`; Apache AGE mirroring milestone; SSE notifications; `tx?: any` → real
transaction type; Phase 2 workers (incl. MILESTONE-2.7); Phase 3 PWA; Phase 4 CI/k6.
