# TASK-06 — Invitaciones globales (router DB)

> Batch: v6.6 · Depends on: TASK-01 · Size: L · Self-contained: yes.

## 1. Context
global_invitations table exists in router DB. No port/adapter/use cases. Invitations are tenant-local only; cross-IdP not supported.

## 2. Objective
Create IGlobalInvitationRepository (router DB) + adapter + use cases CreateGlobalInvitation (creates router row + returns token) and RedeemGlobalInvitation (validates token, resolves tenant, links global user to tenant, creates workspace membership in tenant DB). Adapt CompleteOidcLogin to check invitation token against global invitations. Enable social logins.

## 3. Files to touch
- apps/api/src/domain/ports/IGlobalInvitationRepository.ts
- adapter in RouterDatabaseClient
- use cases: CreateGlobalInvitationUseCase, RedeemGlobalInvitationUseCase
- CompleteOidcLoginUseCase (redeem global invitation)
- controllers + routes + server wiring
- tests + fakes
- web admin (generate global invitation URL/QR)

## 4. Acceptance criteria
- Invite any email with any IdP.
- Redemption requires emailVerified + match; creates membership.
- build/type-check/test green.