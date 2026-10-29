# TASK-03 — Ephemeral/revocable workspace join codes

> **Batch:** Auth v5.3 · **Depends on:** none · **Size:** M
> **Self-contained:** yes.

## 1. Context
`workspaces.join_code` is a single static column. If leaked, anyone can request access indefinitely. It should support multiple codes per workspace, each with TTL, capacity, auto-approve flag, and revocation.

## 2. Objective
Create `workspace_join_codes` table (tenant DB) and endpoints to create/edit/revoke codes. Keep a default long-lived code for simplicity.

## 3. Conventions
- Tenant DB migration. Drizzle schema in `packages/database/src/schema/tenant.auth.schema.ts`.
- Code stored as hash (like event codes). Raw returned once.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `packages/database/src/schema/tenant.auth.schema.ts` |
| Create | migration `0014_*.sql` |
| Create | `apps/api/src/domain/ports/IWorkspaceJoinCodeRepository.ts` |
| Create | `apps/api/src/infrastructure/persistence/repositories/DrizzleWorkspaceJoinCodeRepository.ts` |
| Create | use cases: `CreateWorkspaceJoinCode`, `UpdateWorkspaceJoinCode`, `RevokeWorkspaceJoinCode`, `ListWorkspaceJoinCodes`, `FindByWorkspaceJoinCode` |
| Edit | `RequestWorkspaceAccessUseCase.ts` (use new repo) |
| Edit | `WorkspaceAdminController.ts` + routes |
| Edit | `apps/web/src/lib/api/admin.ts` + admin page |

## 5. Step-by-step
1. Add table: `id, workspace_id (FK), code_hash (unique), label, expires_at, max_uses, used_count, auto_approve (bool), revoked_at, created_by, created_at`.
2. Generate migration.
3. Implement port + Drizzle adapter.
4. Implement use cases (create returns raw code once; update edits TTL/capacity/label/auto_approve; revoke sets revoked_at; find by hash checks expiry/revoked/capacity).
5. Update `RequestWorkspaceAccessUseCase` to use `findByWorkspaceJoinCode` instead of `workspaceRepo.findByJoinCode`.
6. Keep `workspaces.join_code` for backward compat (default code), or migrate to new table with one default row per workspace.
7. Add endpoints under `/api/v1/workspaces/:workspaceId/join-codes`.
8. Web: admin UI to manage codes (create/edit/revoke, show raw code once, copy).

## 6. Additional: QR with both codes for events
- Event entry flow supports a single QR/enlace containing both the tenant code and the workspace code.
- Client redeems tenant code first (creates anonymous user + session), then workspace code (auto-approved if workspace is EVENT).
- Both steps in one user interaction (scan QR → enter).

## 7. Acceptance criteria
- Multiple codes per workspace.
- Expired/revoked/full codes rejected.
- QR with both codes works end-to-end.
- `pnpm turbo run build type-check test` passes.