# TASK-07 — Rate limit dedicado + auditoría (IAuditLog impl)

> Batch: v6.7 · Depends on: none · Size: M · Self-contained: yes.

## 1. Context
scopedRateLimitMiddleware exists but not wired to admin routes. IAuditLog port exists but no implementation.

## 2. Objective
Wire scoped rate limit (per actor) on admin routes (create invitation, request access, rotate code, create workspace). Implement IAuditLog with Drizzle adapter (append to membership_events or new audit table). Record audit events in admin use cases.

## 3. Files to touch
- routes.ts (add scopedRateLimitMiddleware to admin routes)
- apps/api/src/infrastructure/persistence/repositories/DrizzleAuditLog.ts (or reuse membership_events)
- use cases (inject IAuditLog, record events)
- server wiring
- tests + fakes

## 4. Acceptance criteria
- Rate limit blocks excessive admin actions per actor.
- Audit events recorded for admin actions.
- build/type-check/test green.