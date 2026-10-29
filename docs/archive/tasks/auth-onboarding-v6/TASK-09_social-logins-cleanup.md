# TASK-09 — Social logins Zitadel + cleanup endpoint/cron

> Batch: v6.9 · Depends on: none · Size: M · Self-contained: yes.

## 1. Context
Social logins not configured in Zitadel. Cleanup of expired invitations and inactive guests is a stub.

## 2. Objective
Configure Google (personal) and Microsoft (personal) IdPs in Zitadel (docs/ops/zitadel-social-logins.md). Implement cleanup: mark PENDING invitations EXPIRED after TTL; remove anonymous guests inactive N days. Expose as admin endpoint + optional cron.

## 3. Files to touch
- Zitadel config (infra, not code)
- CleanupExpiredInvitationsUseCase (implement with repos)
- controller + route (admin-only)
- tests + fakes
- seed: example invitations

## 4. Acceptance criteria
- Social login works in identity lab.
- Cleanup endpoint removes expired/inactive rows.
- build/type-check/test green.