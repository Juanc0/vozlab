# TASK-04 — Códigos efímeros: port/adapter/use cases + integración

> Batch: v6.4 · Depends on: none · Size: L · Self-contained: yes.

## 1. Context
Table workspace_join_codes exists (migration 0014). No port/adapter/use cases. RequestWorkspaceAccess still uses static workspaces.join_code.

## 2. Objective
Create IWorkspaceJoinCodeRepository (port) + Drizzle adapter + use cases: Create, Update, Revoke, List, FindByCode (with expiry/revoked/capacity checks). Adapt RequestWorkspaceAccessUseCase to use FindByCode. Add endpoints under /api/v1/workspaces/:id/join-codes. Web admin UI to manage codes (show raw once).

## 3. Files to touch
- apps/api/src/domain/ports/IWorkspaceJoinCodeRepository.ts
- apps/api/src/infrastructure/persistence/repositories/DrizzleWorkspaceJoinCodeRepository.ts
- use cases: CreateWorkspaceJoinCode, UpdateWorkspaceJoinCode, RevokeWorkspaceJoinCode, ListWorkspaceJoinCodes, FindByWorkspaceJoinCode
- RequestWorkspaceAccessUseCase (use new repo)
- controllers + routes + server wiring
- tests + fakes
- web admin page

## 4. Acceptance criteria
- Multiple codes per workspace; expired/revoked/full rejected.
- Raw code shown once at creation.
- build/type-check/test green.