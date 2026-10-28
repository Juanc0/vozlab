# TASK-07 — Alta directa por admin via handle/identity (not email)

> **Batch:** Auth v5.7 · **Depends on:** TASK-01 · **Size:** M
> **Self-contained:** yes.

## 1. Context
`AddWorkspaceMemberUseCase` uses email to find the user. Email is not a unique identifier per IdP. Should use handle (unique per tenant) or global identity.

## 2. Objective
Add `auth.users.handle` (unique per tenant, editable by user). Change `AddWorkspaceMember` to accept handle or global identity (issuer, subject). Update admin UI to search by handle.

## 3. Files to touch
- `packages/database/src/schema/tenant.auth.schema.ts` (handle column, unique)
- Migration
- `AddWorkspaceMemberUseCase.ts` (accept handle/identity)
- `TenantAdminRepository` / `UserRepository` (findByHandle, findByGlobalIdentity)
- Web: admin members page search by handle

## 4. Acceptance criteria
- Alta directa works by handle or global identity.
- Email no longer used as lookup key.
- `pnpm turbo run build type-check test` passes.