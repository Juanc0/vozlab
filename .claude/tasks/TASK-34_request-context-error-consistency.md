# TASK-34 — Request-Context Error Consistency (`ERR_INVALID_TOKEN`, not missing-header)

> **Batch:** Phase 1T.1 (Correctness) · **Depends on:** TASK-33 · **Size:** XS
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
TASK-20's rule: `getRequestContext(req)` returns `null` **only** when the guards did not run
(`req.workspaceId`/`req.tid`/`req.user.userId`/`req.user.authorHash` absent), and every controller
must answer `401 ERR_INVALID_TOKEN` in that case. TASK-23 (written in parallel) did not follow it:

```
apps/api/src/infrastructure/http/controllers/ProposalController.ts:107:  if (!ctx) return sendError(reply, 'ERR_MISSING_WORKSPACE_HEADER');
apps/api/src/infrastructure/http/controllers/ProposalController.ts:135:  if (!ctx) return sendError(reply, 'ERR_MISSING_WORKSPACE_HEADER');
```

`ERR_MISSING_WORKSPACE_HEADER` describes a **different** failure (no `X-Workspace-ID`), which the
guard already handles. Behind these two lines a lying error code is returned.

## 2. Objective
Make the two `ProposalController` handlers use the same `401 ERR_INVALID_TOKEN` convention as the
other 22 handler guards.

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: every relative import ends in `.js`.
- `pnpm turbo run build` must pass.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `apps/api/src/infrastructure/http/controllers/ProposalController.ts` |

## 5. Step-by-step instructions
1. In `ProposalController.list` and `ProposalController.get`, replace
   `sendError(reply, 'ERR_MISSING_WORKSPACE_HEADER')` with `sendError(reply, 'ERR_INVALID_TOKEN')`.
2. Sweep the whole HTTP layer for the same mistake: `grep -rn "ERR_MISSING_WORKSPACE_HEADER"
   apps/api/src` must return **only** `TenantWorkspaceGuard.ts` (the legitimate place) after the fix.
3. Do not touch the guard, the error dictionary, or the response shapes.

## 6. Constraints & gotchas
- `ERR_MISSING_WORKSPACE_HEADER` must remain defined in `@vozlab/shared-types` (the guard uses it).
- No behaviour change for a request that has a valid token + header.

## 7. Acceptance criteria
- [ ] `grep -rn "ERR_MISSING_WORKSPACE_HEADER" apps/api/src` → one hit, in `TenantWorkspaceGuard.ts`.
- [ ] `GET /api/v1/proposals` and `GET /api/v1/proposals/:id` answer 401 `ERR_INVALID_TOKEN` when the
      guards were bypassed (unit-level or by inspection).
- [ ] `pnpm turbo run build` passes (3/3).

## 8. Verification commands
```bash
grep -rn "ERR_MISSING_WORKSPACE_HEADER" apps/api/src
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run `pnpm turbo run build`; mark `TASK-34` `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- Any other error-code review (TASK-06 already centralized the mapping).
