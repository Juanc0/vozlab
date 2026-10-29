# TASK-05 — Multiple roles per workspace (schema + union verification)

> **Batch:** Auth v5.5 · **Depends on:** none · **Size:** M
> **Self-contained:** yes.

## 1. Context
Currently one role per (workspace, user). Users should have multiple simultaneous roles; verification uses union of all roles.

## 2. Objective
Change PK to `(workspace_id, user_id, role)` allowing multiple rows. Update all membership use cases, guards, and DTOs to consider all roles (union). UI shows roles list, no impersonation selector.

## 3. Files to touch
- `packages/database/src/schema/tenant.auth.schema.ts` (PK change)
- Migration
- `IMembershipRepository`, `IMembershipAdminRepository`
- `DrizzleMembershipRepository`, `DrizzleMembershipAdminRepository`
- Use cases: AddWorkspaceMember, ChangeMemberRole, SuspendMember, etc.
- Guards: WorkspaceAdminGuard (check if any of user's roles is ADMIN)
- Web: members list shows all roles; admin assigns/removes roles individually

## 4. Additional: consolidate "Members" UI
- Unify direct add (admin-initiated) and approval of join requests into a single "Members" screen.
- Backend remains separate for audit; UI presents one consolidated view.

## 5. Acceptance criteria
- Multiple roles per workspace supported.
- Verification uses union (user with MEMBER+MODERATOR has both permissions).
- Members UI consolidated.
- `pnpm turbo run build type-check test` passes.