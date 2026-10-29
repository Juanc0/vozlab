# TASK-05 — Auto-aprobación configurable + GUEST auto-approve

> Batch: v6.5 · Depends on: TASK-04 · Size: S · Self-contained: yes.

## 1. Context
Workspaces need autoApproveJoinCode flag. Currently not in schema. Event workspaces should auto-approve join code requests.

## 2. Objective
Add `auto_approve_join_code` boolean to workspaces (or use workspace_join_codes.auto_approve). Logic: if auto-approve true, join code creates ACTIVE membership; else PENDING request. Expose toggle in admin UI and API.

## 3. Files to touch
- schema (if adding column) + migration
- UpdateWorkspaceUseCase (patch autoApproveJoinCode)
- RequestWorkspaceAccessUseCase (branch on flag)
- controller/routes
- tests + fakes
- web admin toggle

## 4. Acceptance criteria
- Toggle works; auto-approved memberships created when enabled.
- build/type-check/test green.