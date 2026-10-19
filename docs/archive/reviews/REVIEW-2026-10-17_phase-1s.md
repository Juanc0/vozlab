# Phase 1S Review — Results, Cross-Cutting Findings & Next-Batch Plan

> **Date:** 2026-10-17 · **Scope:** TASK-18 … TASK-31 (Phase 1S) + fresh code vs `/docs` audit
> **Method:** every task's acceptance criteria read from `.claude/tasks/TASK-NN_*.md` and checked
> against the code at `HEAD` (`73f8978`). Commands actually run and their results:
> `pnpm turbo run build` → **3/3 successful**; `pnpm --filter @vozlab/api test` → **6 files / 19
> tests passed**; `pnpm turbo run test` → **3 successful** (with a `coverage/**` outputs warning);
> `cd apps/api && node -e "require.resolve('@vozlab/database')"` → **resolves**.
> **No source code was changed.** Only this report, `.claude/tasks/TASK-32…45_*.md`, `TODO.md`,
> `.claude/tasks/README.md` and `EXECUTION_PLAN.md` were created/edited.

## 0. Verdict at a glance

**Phase 1S delivered 14/14 tasks.** The bootstrap, identity, isolation, soft-delete, rate-limit,
vote-semantics, enum, subgraph and test work is real and verified in code; the two claims that
were merely "type-checks" in Phase 1R (`H-3` boot, `H-5` token) are genuinely fixed, and the
`H-1`/`H-2`/`H-4` defects are closed. The remaining gaps are **newly-exposed integration seams**,
not regressions: the documented dev workflow still cannot reach a running API by copy-pasting
`.env.example`, the author-hash salt is deployment-global and not rotatable, the AI-worker
"which workspace does this source write to?" mapping does not exist, and timestamp ownership is
split between domain and adapter.

Findings raised in the Phase-1R review are all closed except `M-12` (missing FK/unique on
`edit_proposals`) which was out of the 1S scope.

## 1. Per-task verdicts

| # | Task | Verdict | Evidence / note |
| --- | --- | --- | --- |
| 18 | API dev boot + `.env.example` | ✅ (with caveat) | Both package `exports` now carry `types`/`import`/`require`/`default`; `require.resolve` succeeds. `.env.example` lists every `env.ts` var. **Caveat:** nothing loads `.env` (`H-6`) — the "copy it" instruction is not wired into `dev`/`start`. |
| 19 | Dev identity bootstrap | ✅ | `dev-identities.ts` (frozen fixtures, `sub = auth.users.id`, `authorHash = sha256('dev-<name>')`), `mint-dev-token.ts` (`--as`, HS256 12 h, `tid=sabana`, `type` for the agent, refuses short secrets), `seed-dev.ts` inserts 4 users / 3 memberships batched + idempotent. |
| 20 | Author-hash hardening | ✅ (with caveat) | `AUTHOR_HASH_SALT` required ≥ 16; `resolveAuthorHash` is the single salt reader; `AuthGuard` rejects a missing `sub`; `getRequestContext` has no `'anonymous'`. `grep 'default-salt'` is empty. **Caveat:** the salt is process-global, not per-tenant, and rotation is unsafe (`H-7`). Three unreachable `proposedBy = 'unknown'` domain defaults remain (`L-11`). |
| 21 | System-agent identity contract | ✅ | `AgentTypeSchema` exported; `AuthGuard` derives `AGENT_TYPES` from `AgentTypeSchema.options`, marks `isSystemAgent`/`agentType`, 401s an unknown `type`; membership bypass preserved; claim table + curl example in `modules_02 §3.2`, pointer from `system_02 US-07`. |
| 22 | Cross-workspace isolation | ✅ (with caveat) | Edge endpoints, proposal resolve, thread consumers and ontology class lookups/mutations are all workspace-scoped; `modules_02 §6.6` records the 404-not-403 rule. **Caveat:** `proposalAuthorization.resolveTargetAuthorHash` scopes ONTOLOGY but resolves NODE/EDGE with the workspace-less `findById` (`M-16`). |
| 23 | Real proposal read endpoints | ✅ (with caveat) | `ListProposalQuerySchema`; `findByIdInWorkspace` + `findByWorkspace` (keyset, `limit+1`, `status`/`targetType`); `List`/`Get` use cases; controller returns `{ proposals, nextCursor }` / `{ proposal }`; stubs deleted. **Caveat:** the two handlers answer `ERR_MISSING_WORKSPACE_HEADER` on a null context instead of the 20/28-era `ERR_INVALID_TOKEN` (`L-9`). |
| 24 | Keyset + soft-delete dedup | ✅ | `infrastructure/persistence/keyset.ts` is the only home (`grep 'function encodeCursor'` → 1 file); `keysetAfter` used by node/edge/discussion/proposal adapters; `Edge.softDelete()` deleted → adapter is the only `deleted_at` writer. |
| 25 | Soft-delete policy | ✅ | `listPosts` filters `isNull(deletedAt)`; `findPostById`/`softDeletePost` + node `softDelete`; author-only `DELETE /nodes/:id` and `/discussions/posts/:id` (204); `ERR_POST_NOT_FOUND` added; policy table in `modules_01 §2`. `ListPostsUseCase` unchanged (leak was in the adapter). |
| 26 | Rate limit per actor | ✅ | Two fixed-window buckets (`{method}:{actor}` first, then coarse `{method}` × `RATE_LIMIT_WORKSPACE_MULTIPLIER`); `WRITE_METHODS` hoisted; `RATE_LIMIT_WORKSPACE_MULTIPLIER` validated; fail-open preserved; NFR-08 reworded. |
| 27 | Vote semantics | ✅ | `VoteValue` is the only `interactionType → delta` map; `existsInWorkspace` (NODE/EDGE/PROPOSAL/POST, posts joined through threads) runs **before** the insert; CQRS decision recorded in `modules_01 §5` + `modules_02 §1`. **New caveat:** proposal *creation* still accepts any target (`M-11`). |
| 28 | Typed enums at boundaries | ✅ (with caveat) | `WorkspaceRoleSchema`/`SystemRoleSchema`/`isModeratorOrAdmin`; `IMembershipRepository` re-exports the role; both `switch`es end in `assertNever`; `shared/assertNever.ts`. **Caveat:** `dev-identities.ts` re-declares the two role unions instead of importing them (`L-10`). |
| 29 | Subgraph bounding + AGE decision | ✅ | CTE uses a single recursive self-reference that parses on PG 18 (documented deviation from the literal "LIMIT in both terms"); per-direction + per-step + outer `LIMIT`; workspace-covering partial indexes in `0001_demonic_tomas.sql`; `EXPLAIN ANALYZE` shows index scans; AGE decision in `modules_01 §4` + `EXECUTION_PLAN.md`. |
| 30 | Infra error mapping + shutdown | ✅ (with caveat) | `InfrastructureError`; `RouterDatabaseClient` throws instead of returning `null` on driver errors; the guard maps infra → 503 / unknown → 500 and keeps 403 for a genuine `null`; `SIGTERM`/`SIGINT` → `app.close()`. **Caveat:** `ConnectionPoolManager` still consumes `getTenantDatabaseConfig`'s `null` branch, now unreachable-through-throw (`L-15`). |
| 31 | Vitest domain baseline | ✅ | `vitest.config.ts` with the NodeNext `.js→.ts` plugin; 6 files / 19 tests, fakes only; `tsc` does not type-check `tests/**`. |

## 2. Cross-cutting findings (severity-ranked)

### High
- **H-6 — `.env` is never loaded, so the documented dev workflow still cannot boot.** `tsx` has no
  dotenv support (`apps/api/node_modules/tsx/package.json` depends only on `esbuild`), `dotenv` is
  not a dependency anywhere, and neither `dev` nor `start` passes `--env-file`. `.env.example` says
  "Copy to `.env` and fill in", but `tsx watch src/index.ts` will not read it → Zod "Invalid
  environment variables" exit 1. TASK-19's `db:mint-token` has the same problem (reads
  `process.env.JWT_SECRET`). E2E remains unverifiable without manually exporting every var.
- **H-7 — The author-hash salt is deployment-global and not rotatable.** `AUTHOR_HASH_SALT` is one
  process-wide value shared by every tenant on the instance, so two institutions on one API share a
  pseudonym space. Worse, rotation is destructive: the pseudonym is *stored* (`users.author_hash`,
  `nodes.author_hash`, …) and *used for authorization* (maintainer matching, `unique_user_target_vote`),
  so re-keying changes every derived caller hash and instantly breaks approve/reject and
  double-counts votes. There is no `hash_version`/`salt_id`, no dual-read, no backfill, and no guard
  against shipping the `.env.example` value to production.
- **H-8 — There is no data-source → workspace mapping.** `modules_05` gives the Extractor a
  `RawSourceRecord { source_id, channel_name, raw_content, workspace_id }` and forwards
  `X-Workspace-ID: workspace_id` verbatim. Nothing in `packages/database` (no `sources` table) or
  the API resolves `source_id → workspace`; the worker is trusted to pick any workspace. This is
  the concrete blocker for Phase 2 and the subject of concerns #2/#3.

### Medium
- **M-11 — Proposal creation does not validate its target.** `CreateProposalUseCase` inserts
  `targetId`/`targetType` without checking existence or workspace, and `edit_proposals.target_id`
  has no FK (`M-12` from the 1R review, still open). A proposal can point at a nonexistent or
  foreign-workspace object; resolution then fails late (or, for NODE/EDGE, resolves a foreign author
  — see `M-16`).
- **M-12 — Timestamp ownership is split.** `Node.createdAt/updatedAt` are domain fields, but
  `DrizzleNodeRepository.update`/`applyDelta` write `updatedAt: new Date()` in the adapter,
  ignoring `node.updatedAt`; `softDelete` correctly lives only in the adapter (TASK-24). The rule
  ("domain owns business timestamps, adapter owns `deleted_at`") is undocumented and the domain
  field is effectively dead. This is concern #4.
- **M-13 — `modules_05` extractor drift.** The sample `type_key` defaults to `"problem"`
  (lower-case) while the seeded/validated ontology key is `Problem`; the `_send_to_fastify` headers
  omit `x-correlation-id` and the doc never states the bot JWT claims (TASK-21) or the Redis
  dedup/cache contract it describes in §1; `api_key` is treated as a static bearer instead of a
  minted agent token.
- **M-14 — Port/adapter naming is incoherent.** Same concept, three shapes:
  `softDelete` (node/edge) vs `softDeletePost`; `findById` vs `findByIdInWorkspace` vs
  `findPostById`/`findThreadById`; `update` (node/edge) vs `updateThreadStatus`;
  `applyScoreDelta` vs `applyDelta` vs `applyClassDelta`. This is concern #6.
- **M-15 — `tx?: any` erodes type safety repo-wide.** Deferred in TASK-16/24/30 but cheap to close
  with one exported transaction type alias; every port and adapter repeats `tx?: any`.
- **M-16 — Target-author resolution is asymmetric.** `proposalAuthorization.resolveTargetAuthorHash`
  scopes ONTOLOGY via `findClassById(id, workspaceId, tid)` but resolves NODE/EDGE with the
  workspace-less `findById(id, tid)`, so a crafted proposal can resolve a foreign-workspace author.

### Low
- **L-9** `ProposalController.list`/`.get` return `ERR_MISSING_WORKSPACE_HEADER` for a null context;
  every other handler (and TASK-20's rule) uses `ERR_INVALID_TOKEN`.
- **L-10** `packages/database/scripts/dev-identities.ts` re-declares `SystemRole` and
  `WorkspaceRole` literals instead of importing `SystemRoleSchema`/`WorkspaceRoleSchema`.
- **L-11** Three domain constructors default `proposedBy = 'unknown'` (unreachable, but a second
  vocabulary for "missing").
- **L-12** `pnpm turbo run test` warns `no output files found for task @vozlab/api#test` because
  `turbo.json` declares `outputs: ["coverage/**"]`; there is no root `test` script.
- **L-13** `CastVoteUseCase` re-wraps an already-resolved hash via
  `resolveAuthorHash(input.userHash, input.userHash)` (a no-op that reads as if it derives).
- **L-14** `keysetAfter` duplicates the `ORDER BY` direction as a string literal at four call sites
  (fine, but the convention isn't stated).

## 3. Docs drift found in Phase 1S

| Doc | Says | Reality |
| --- | --- | --- |
| `.env.example` header | "Copy to `.env`" | Nothing loads `.env` (`H-6`). |
| `modules_05 §3` | `type_key` default `"problem"`; `api_key` bearer; no `x-correlation-id` | Ontology key is `Problem`; the worker contract is the agent JWT (`modules_02 §3.2`); the API accepts `x-correlation-id`. |
| `modules_05 §1` vs §3 | §1 describes a Redis dedup cache + serverless gateway | §3 code has no cache and calls `workspace_id` straight from the payload. |
| `modules_01 §4` / `00_ARCHITECTURE` | Apache AGE + openCypher traversal | Decision recorded (TASK-29) to keep the SQL CTE; AGE deferred. Consistent now, but `modules_01 §4` still shows `create_graph`/labels as if they were the read path. |
| `system_01 NFR-08` | "per IP/Tenant" | Now per-actor + workspace ceiling (updated). OK. |
| `docs` PG/drizzle pins | PG 16 / drizzle 0.34 | Actual PG 18 + drizzle 0.45 (unchanged drift from 1R, docs not authoritative). |

## 4. Concerns raised by the user (answers)

### C1 — What does the salt do, should it be in the router DB, and how do we rotate it?
`author_hash = SHA-256(identity + salt)`. The salt makes the pseudonym (NFR-07) non-reversible:
without it, a 64-hex of a known OIDC `sub` is trivially reproducible (rainbow table), and two
institutions would produce the same pseudonym for the same subject. It is *per-institution* config,
so your instinct is right: if the router DB serves multiple institutions, the salt belongs **per
tenant** (`tenants.author_hash_salt`, or a `tenant_secrets` table), not in one process env var.
Rotation, however, is **not a config change** — it is a data migration: the pseudonym is stored on
rows and compared for authorization, so a new salt requires a `hash_version` (or `salt_id`) column on
`users`/`nodes`/`edges`/`interactions_log`, a dual-read window, and a backfill. Do we need it? Today
(dev, one tenant) no; the moment two institutions share a deployment, yes. Answer + minimal step in
`TASK-37`, full per-tenant/rotation milestone in `EXECUTION_PLAN.md` → Deferred.

### C2 — How does each AI worker know which workspace to write to?
Today it doesn't "know": the mapping is expected to arrive **in the queue message envelope**
(`modules_05` `RawSourceRecord.workspace_id`, produced by the serverless gateway), and the worker
forwards it as `X-Workspace-ID`. There is no `sources` table and no API route that resolves
`source_id → workspace`, so the worker (or the gateway) is trusted to choose. The three options:
1. **Envelope-carried** (status quo): simplest, zero schema, but the worker must be trusted and can
   be pointed at any workspace; no registry, no per-source audit.
2. **Registry table** (`meta.data_sources`: `source_id`, `workspace_id`, `connector_type`,
   `behavior_profile`, `bot_identity`): the gateway enqueues raw + `source_id` only; the API is the
   single authority that resolves `source_id → workspace` on ingest. Robust, auditable, and the
   natural home for the per-source behavior of C3.
3. **Worker-per-workspace** with static config: best isolation, worst ops (one deployment per
   workspace).
Recommendation: **(2)** — the API owns the mapping (it already owns tenancy/ontology); the worker
never picks a workspace. Decision + shared-types contract in `TASK-41`; the table/routes land with
Phase 2 (the workers), not before, to avoid a speculative schema.

### C3 — Should extractor behavior be per tenant, per workspace, or per data source?
Per **data source**, scoped by workspace, inside the tenant. Behavior (connector, prompt, default
`typeKey`, dedup window) is a function of the *source type/channel* — `modules_05 §1` already says
"Processing Strategy by Source Type" (minutes vs surveys). The workspace supplies the ontology and
validation (FR-06), the tenant supplies physical isolation. Keep **one** worker codebase and load a
*behavior profile* per source; do not fork code per tenant/workspace. That is the shape `TASK-41`'s
registry should carry (`behavior_profile` column), and `TASK-42` fixes the doc that implies otherwise.

### C4 — Where do create/update/follow-edit belong (hexagonal), and who stamps the soft-delete date?
The rule to write down (`TASK-38`):
- **Create** — the use case constructs the entity (`randomUUID`), the entity sets `createdAt`/
  `updatedAt` and enforces invariants; the **adapter** only persists.
- **Update / follow-edits** — the use case loads the aggregate, invokes the **entity method**
  (state machine / `updateAttributes`), which is the single writer of `updatedAt`; the adapter
  persists `node.updatedAt` **as-is**. Today the adapter overwrites it — that is the bug.
- **Approved proposal delta** — the use case orchestrates inside `UnitOfWork`; the adapter projects
  the whitelisted delta.
- **Soft-delete** — a pure persistence concern with no domain rule: the **adapter is the single
  writer of `deleted_at`** (TASK-24); the use case only authorizes and calls `repo.softDelete`.
  Therefore `deletedAt` should not be a domain constructor argument (`DiscussionPost` currently
  takes it — a smell to note).
- **Reads** — adapters filter `deleted_at`; use cases enforce workspace/authorization.

### C5 — How hard is Apache AGE, why duplicate, and what are the options?
Already reviewed in TASK-29; short version: AGE stores the graph in its own label tables
(`vozlab_graph`), so making it the read path requires **dual-write** on every node/edge mutation plus
a **backfill** and **reconciliation** — that is why it "duplicates" the relational rows. Options:
(a) keep the bounded SQL recursive CTE (chosen; it is index-covered and O(limit·depth));
(b) AGE as a *projection* kept in sync by a worker/trigger, read via Cypher (adds eventual
consistency + ops);
(c) AGE as the source of truth (largest rewrite; loses easy RLS/Drizzle joins).
Decision stands: (a) now, (b) as its own milestone if/when multi-hop analytics need Cypher.

### C6 — Function-name coherence across layers
`M-14`. `TASK-39` writes a canonical vocabulary (verbs: `find`/`list`/`save`/`update`/`softDelete`/
`apply…Delta`; suffixes: `…ById`, `…ByWorkspace`, `…InWorkspace`) into `modules_02 §6.7` and does a
bounded, grep-verifiable rename of the worst offenders (`softDeletePost` → `softDelete` on the
discussion port, `updateThreadStatus` → `update`), keeping behaviour identical.

### C7 / C8 — empty in the request
No action; the batch below stays extensible (`TASK-46+`) if you add them.

## 5. Handoff-flag responses (from TASK-19/20/25/26/27/29/30)

| Flag | Response |
| --- | --- |
| 19: `sub` = `auth.users.id`, not the OIDC subject | Correct and required (membership is keyed by it). Recorded in `modules_02 §3.2`; `TASK-41`'s mapping must preserve this (`source → tenant → workspace`, and the bot's `sub` is the seeded agent row). |
| 19: `maintainer.systemRole = USER` keeps a legacy `ADMIN` row | Accepted. `onConflictDoNothing` is the right idempotency trade-off; the load-bearing authority is membership + `proposedBy`, not `system_role`. No change. |
| 19: E2E unverified (no Redis / no Docker) | Correct, and **still** blocked end-to-end by `H-6` (`.env` not loaded) even with a broker. `TASK-32` unblocks it; integration tests remain a separate milestone (no Docker in this env). |
| 20: 3 domain `proposedBy = 'unknown'` defaults left | Accepted as unreachable; cleaned up anyway in `TASK-40` for one vocabulary of "missing". |
| 25: `threadId` optional / derived; `ListPostsUseCase` untouched | Accepted; matches the flat route. Documented in the use case. No change. |
| 26: warn log dropped `count`; `hit` returns boolean | Accepted — the spec (`hit(key, limitMax) => boolean`) is the smaller API; `actor`/`bucket`/`limit` are the useful fields. No change. |
| 27: POST scoped through `discussion_threads`; `edit_proposals` has no `deletedAt` | Correct; verified in `DrizzleInteractionRepository`. `TASK-33` extends the same rule to proposal *creation*. |
| 29: acceptance criterion #1 literally impossible | Accepted; the deviation is documented inline and the intent (row-bounded recursion) is met. `TASK-29` AC wording to be softened in `TODO.md`. |
| 30: `getTenantDatabaseConfig` now throws | Intended 5xx path; `TASK-36` audits every caller and pins the contract with a test. |

## 6. Next batch — PHASE 1T (Dev Ergonomics, Layering & Ingestion Contract)

14 atomic tasks, `TASK-32…TASK-45`, one self-contained file each.

| # | Task file | Group | Depends on | Finding |
| --- | --- | --- | --- | --- |
| 32 | `TASK-32_dev-env-loading.md` | 1T.1 | — | H-6 |
| 33 | `TASK-33_proposal-target-validation.md` | 1T.1 | — | M-11 |
| 34 | `TASK-34_request-context-error-consistency.md` | 1T.1 | 33 | L-9 |
| 35 | `TASK-35_proposal-authorization-workspace-scoping.md` | 1T.1 | 33 | M-16 |
| 36 | `TASK-36_tenant-db-config-contract.md` | 1T.1 | — | L-15 |
| 37 | `TASK-37_author-hash-salt-hardening-and-rotation.md` | 1T.2 | — | H-7 |
| 38 | `TASK-38_timestamp-ownership.md` | 1T.3 | — | M-12 |
| 39 | `TASK-39_port-naming-convention.md` | 1T.3 | 38 | M-14 |
| 40 | `TASK-40_domain-placeholder-and-type-dedup.md` | 1T.3 | 39 | L-10, L-11 |
| 41 | `TASK-41_datasource-workspace-mapping-decision.md` | 1T.4 | — | H-8 |
| 42 | `TASK-42_extractor-doc-drift.md` | 1T.4 | 41 | M-13 |
| 43 | `TASK-43_typed-transaction-handle.md` | 1T.5 | 39 | M-15 |
| 44 | `TASK-44_use-case-test-baseline.md` | 1T.5 | 38, 43 | Phase 4.1 |
| 45 | `TASK-45_test-task-wiring.md` | 1T.5 | 44 | L-12 |

**Suggested waves:**
`(32, 33, 36, 41) → (34, 35, 37, 38) → (39, 42) → (40, 43) → (44, 45)`.

## 7. Commands run (and why)

```bash
pnpm turbo run build                 # 3/3 — every TS package type-checks after Phase 1S
pnpm --filter @vozlab/api test       # 6 files / 19 tests — TASK-31 baseline
pnpm turbo run test                  # 3 successful — CI can run it (TASK-45 fixes the outputs warning)
cd apps/api && node -e "require.resolve('@vozlab/database')"   # resolves — TASK-18 fix verified
grep -rn "'unknown'\|'anonymous'" apps/api/src                 # 3 unreachable domain defaults (L-11)
grep -rn "function encodeCursor\|function decodeCursor" apps/api/src   # 1 file (TASK-24)
grep -rn "ERR_MISSING_WORKSPACE_HEADER" apps/api/src           # 2 controller stragglers (L-9)
```
