# TASK-44 — Use-Case Test Baseline (application layer, fakes only)

> **Batch:** Phase 1T.5 (Quality) · **Depends on:** TASK-38, TASK-43 · **Size:** M
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
TASK-31 seeded Vitest with 6 files / 19 tests: 4 domain files, `keyset`, and one
**application** test (`CloseThreadUseCase`). The application layer is where TASK-22/25/27 added the
authorization and workspace-isolation rules, and none of those are covered:

- `CreateEdgeUseCase` — must reject a foreign-workspace endpoint (`ERR_NODE_NOT_FOUND`).
- `CastVoteUseCase` — must verify the target (`existsInWorkspace`) **before** inserting, derive the
  delta via `VoteValue`, and be idempotent for the same vote type.
- `DeleteNodeUseCase` / `DeletePostUseCase` — 404 for missing/foreign/soft-deleted, 403 for a
  non-author, adapter-owned soft-delete.
- `AutoApplyProposalUseCase` — 403 without a moderator/admin role (`isModeratorOrAdmin`), plus the
  workspace check before any role check.

The fake pattern already exists in `apps/api/tests/application/CloseThreadUseCase.test.ts` (plain
object literals implementing the port, no library).

## 2. Objective
Add application-layer unit tests with in-memory fakes so the 1S authorization/derivation rules can
never silently regress.

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: relative imports in test files end in `.js` too.
- No DB, no Redis, no network — fakes only.
- `pnpm turbo run build` must still pass; tests are outside `src/**` so `tsc` ignores them.
- Assert on returned values / thrown `DomainError.code`, never on log output or wall-clock beyond
  `>=` comparisons.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Create | `apps/api/tests/application/CreateEdgeUseCase.test.ts` |
| Create | `apps/api/tests/application/CastVoteUseCase.test.ts` |
| Create | `apps/api/tests/application/DeleteNodeUseCase.test.ts` |
| Create | `apps/api/tests/application/DeletePostUseCase.test.ts` |
| Create | `apps/api/tests/application/AutoApplyProposalUseCase.test.ts` |
| Create | `apps/api/tests/support/fakes.ts` (shared fakes, only if it reduces duplication) |

## 5. Step-by-step instructions
1. Read each use case's constructor + input type before writing its test (they changed in 1S).
2. **`CreateEdgeUseCase`**: fake `IEdgeRepository`/`INodeRepository`/`IOntologyRepository`/
   `IEventPublisher`.
   - both nodes in the request workspace → `edgeRepo.save` called once, event published;
   - source in another workspace → rejects `ERR_NODE_NOT_FOUND` **and** `save` not called;
   - target in another workspace → same.
   (If TASK-35 added `findByIdInWorkspace`, fake that method too.)
3. **`CastVoteUseCase`**: fake `IInteractionRepository` (track `save`/`applyScoreDelta`/insert order)
   + a fake `IUnitOfWork` that just runs the callback with a sentinel `tx` + a fake publisher.
   - `DOWNVOTE` → delta `-1`; `UPVOTE`/`SUPPORT`/`VALIDATE` → `+1` (assert the delta passed to
     `applyScoreDelta`);
   - target missing/foreign (`existsInWorkspace` → false) → 404, and **no** insert happens;
   - an existing identical vote → returns it without inserting (idempotent);
   - an existing different vote → `ERR_DUPLICATE_INTERACTION`.
4. **`DeleteNodeUseCase`**: fake `INodeRepository` (`findById`, `softDelete`) + publisher.
   - author + same workspace → `softDelete` called once with `node.id`;
   - missing node → `ERR_NODE_NOT_FOUND`; foreign workspace → `ERR_NODE_NOT_FOUND`;
   - non-author → `ERR_AUTHORIZATION_FAILED`, and `softDelete` **not** called.
5. **`DeletePostUseCase`**: fake `IDiscussionRepository` (`findPostById`, `findThreadById`,
   `softDelete`) + publisher. Mirror the four node cases; add:
   - post belongs to a thread in another workspace → `ERR_THREAD_NOT_FOUND`, no delete;
   - `post.threadId !== threadId` → `ERR_POST_NOT_FOUND`.
6. **`AutoApplyProposalUseCase`**: fake `IProposalRepository` (`findById`), `IMembershipRepository`
   (`getRole`), the three target repos, `IUnitOfWork`, publisher.
   - `getRole` → `MEMBER`/`null` → `ERR_AUTHORIZATION_FAILED` (before touching the target);
   - proposal in a foreign workspace → `ERR_PROPOSAL_NOT_FOUND` even when the role is `ADMIN`;
   - `getRole` → `MODERATOR` but the domain criteria are unmet → `ERR_UNMET_AUTO_APPLY_CRITERIA`.
   (Do not reproduce the full 14-day/score matrix here — `EditProposal.test.ts` already covers it.)
7. Run the suite; keep each file focused and under ~150 lines. Put shared helpers in
   `tests/support/fakes.ts` only if at least two files use them.

## 6. Constraints & gotchas
- Do **not** import `@vozlab/database` or any Drizzle adapter in these tests.
- Do **not** assert on `Date.now()` equality; use `>=`.
- Do **not** test controllers or routes here (a later integration milestone).
- The `IUnitOfWork` fake must pass a non-`undefined` `tx` sentinel so the use case's transaction
  branch is exercised.
- If a fake object literal fails to satisfy the port after TASK-39's renames, update it — do not
  weaken the port.

## 7. Acceptance criteria
- [ ] At least 5 new `application` test files, all passing with `pnpm --filter @vozlab/api test`.
- [ ] The listed authorization/isolation/derivation cases are each asserted.
- [ ] No test opens a DB/Redis/network connection.
- [ ] `pnpm turbo run build` passes (3/3) and does not type-check `tests/**`.

## 8. Verification commands
```bash
pnpm --filter @vozlab/api test
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run both commands; mark `TASK-44` `[x]` in `TODO.md` with the new file/test counts.

## 10. Out of scope
- Integration tests (Testcontainers) and coverage thresholds (`MILESTONE-4.2`, skipped in this env:
  no Docker).
- Controller/route tests.
