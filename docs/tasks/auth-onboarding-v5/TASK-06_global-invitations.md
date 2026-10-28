# TASK-06 — Global invitations (cross-IdP)

> **Batch:** Auth v5.6 · **Depends on:** TASK-01 · **Size:** L
> **Self-contained:** yes.

## 1. Context
Invitations live in tenant DB, so tenant is resolved by IdP claims. Cross-IdP/external collaborators can't be invited. Need a global invitation in router DB that resolves tenant before OIDC.

## 2. Objective
Create `global_invitations` table in router DB (token_hash, tenant_id, workspace_id, role, email, expires_at, status, used_count). Implement create/redeem flow: token resolves tenant; after OIDC, redeem in tenant DB (create membership). Enable social logins in Zitadel.

## 3. Files to touch
- `packages/database/src/schema/router.schema.ts` (global_invitations table)
- Migration (router)
- `apps/api/src/domain/ports/IGlobalInvitationRepository.ts`
- Drizzle adapter
- `CreateGlobalInvitationUseCase`, `RedeemGlobalInvitationUseCase`
- `CompleteOidcLoginUseCase` (check global invitation token)
- Zitadel config (social IdPs)
- Web: admin UI generates invitation URL/QR from global invitation

## 4. Acceptance criteria
- Invite any email with any IdP.
- Redemption requires emailVerified + match.
- Social logins work.
- `pnpm turbo run build type-check test` passes.