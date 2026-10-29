# TASK-03 — Alta directa por handle/identidad global

> Batch: v6.3 · Depends on: none · Size: M · Self-contained: yes.

## 1. Context
AddWorkspaceMemberUseCase uses email to find user. Email is not unique per IdP. Use handle or global identity.

## 2. Objective
Change AddWorkspaceMember to accept handle or globalUserId (issuer, subject). Add findByHandle / findByGlobalUserId to UserRepository. Update admin UI to search by handle. Email becomes informational.

## 3. Files to touch
- apps/api/src/domain/ports/IUserRepository.ts (findByHandle, findByGlobalUserId)
- DrizzleUserRepository (implement)
- AddWorkspaceMemberUseCase (accept handle/globalUserId, resolve user)
- Admin controller + routes (input validation)
- tests + fakes
- web admin members page (search by handle)

## 4. Acceptance criteria
- Alta directa works by handle or global identity.
- Email no longer used as lookup key.
- build/type-check/test green.