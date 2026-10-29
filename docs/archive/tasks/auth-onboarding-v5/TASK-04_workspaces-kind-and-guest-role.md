# TASK-04 — Workspaces.kind + users.is_anonymous + GUEST role

> **Batch:** Auth v5.4 · **Depends on:** none · **Size:** M
> **Self-contained:** yes.

## 1. Context
Workspaces have no type; guests (event attendees) have no distinct role. Need to differentiate EVENT/PUBLIC/PRIVATE workspaces and restrict guests.

## 2. Objective
Add `workspaces.kind` (EVENT/PUBLIC/PRIVATE), `auth.users.is_anonymous` (boolean), and `GUEST` role. Enforce: guests only in EVENT workspaces; guests cannot request access to other workspaces or create workspaces; guests CAN create proposals (PENDING).

## 3. Files to touch
- `packages/database/src/schema/tenant.auth.schema.ts` (workspaces.kind, users.is_anonymous)
- Migration
- `WorkspaceRoleSchema` in shared-types (add GUEST)
- Guards: `WorkspaceAdminGuard`, tenant/workspace guards to check guest restrictions
- `JoinEventUseCase`: set is_anonymous=true, role=GUEST
- `RequestWorkspaceAccessUseCase`: reject if guest requesting non-event workspace
- `CreateWorkspaceUseCase`: reject if guest
- Web: display kind badge

## 4. Acceptance criteria
- kind column with CHECK constraint.
- is_anonymous column.
- GUEST role in shared-types.
- Guards enforce restrictions.
- `pnpm turbo run build type-check test` passes.