# TASK-08 — Atomizar use cases

> Batch: v6.8 · Depends on: TASK-01, TASK-06 · Size: L · Self-contained: yes.

## 1. Context
Monolithic use cases (CompleteOidcLogin, etc.) need splitting into small, composable, auditable operations.

## 2. Objective
Split into atomic use cases: Authenticate, ResolveTenants, SelectTenant, RedeemInvitation (global + tenant), JoinEvent, RequestWorkspaceAccess, ApproveJoinRequest, CreateWorkspace, ManageRole. Each independently testable with IAuditLog. Controllers compose operations.

## 3. Files to touch
- apps/api/src/application/use_cases/ (new atomic files)
- controllers (compose)
- tests (per atomic use case)
- remove/deprecate monolithic where possible

## 4. Acceptance criteria
- Each operation independently testable.
- Audit event per operation.
- No regression in existing flows.
- build/type-check/test green.