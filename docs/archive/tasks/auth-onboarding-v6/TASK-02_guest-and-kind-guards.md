# TASK-02 — Guards GUEST + workspaces.kind enforcement

> Batch: v6.2 · Depends on: none · Size: M · Self-contained: yes.

## 1. Context
GUEST role and workspaces.kind exist in schema/shared-types but guards don't enforce restrictions.

## 2. Objective
Enforce: GUEST only in EVENT workspaces; GUEST cannot create workspaces, request access to other workspaces, or administer. workspaces.kind drives policies (EVENT allows event join + auto-approve; PUBLIC discoverable; PRIVATE code-only).

## 3. Files to touch
- apps/api/src/infrastructure/http/middlewares/* (or use cases) to check user.isAnonymous / membership roles.
- CreateWorkspaceUseCase: reject if actor is GUEST or anonymous.
- RequestWorkspaceAccessUseCase: reject if user is GUEST requesting non-EVENT workspace.
- JoinEventUseCase: set is_anonymous=true, role=GUEST, only if workspace.kind===EVENT (or allow any? restrict to EVENT).
- WorkspaceAdminController / guards: kind-based rules.
- DrizzleUserRepository: read isAnonymous.
- tests + fakes.

## 4. Acceptance criteria
- GUEST cannot create workspace (403/404).
- GUEST cannot request access to non-EVENT workspace.
- Event join only works for EVENT workspaces.
- build/type-check/test green.