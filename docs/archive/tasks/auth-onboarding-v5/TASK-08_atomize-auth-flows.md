# TASK-08 — Atomize auth/onboarding flows + audit

> **Batch:** Auth v5.8 · **Depends on:** TASK-01, TASK-02, TASK-06 · **Size:** L
> **Self-contained:** yes (assumes prior tasks; read them first).

## 1. Context
Current use cases are monolithic (CompleteOidcLoginUseCase does identity + tenant + invitation). Need to split into small, composable, auditable operations.

## 2. Objective
Refactor auth/onboarding into atomic use cases: Authenticate, ResolveTenants, SelectTenant, RedeemInvitation, JoinEvent, RequestWorkspaceAccess, ApproveJoinRequest, CreateWorkspace, ManageRole. Each independently testable. Add audit events per operation.

## 3. Files to touch
- `apps/api/src/application/use_cases/` (split existing use cases)
- `apps/api/src/application/audit/` (new audit port + adapter)
- `apps/api/src/infrastructure/http/controllers/AuthController.ts` (compose operations)
- `apps/api/src/infrastructure/ratelimit/` (dedicated per-actor rate limiter)
- `apps/api/src/infrastructure/persistence/repositories/DrizzleRefreshTokenRepository.ts` (invalidate family)
- Tests for each atomic use case

## 4. Additional: invalidate refresh family on suspend + dedicated rate limit
- When a user is suspended, invalidate their refresh token family (all sessions).
- Add dedicated per-actor rate limiting for admin actions (create invitation, request access, rotate code, create workspace).
- Rate limit keyed by (actorUserId, action).

## 5. Acceptance criteria
- Each operation independently testable.
- Audit event per operation.
- Refresh family invalidated on suspend.
- Dedicated rate limit per actor/action.
- No regression in existing flows.
- `pnpm turbo run build type-check test` passes.