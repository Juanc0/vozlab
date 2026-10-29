# TASK-11 — Web: admin UI (códigos, invitaciones, roles, kind, selector, Miembros)

> Batch: v6.11 · Depends on: TASK-04, TASK-06 · Size: L · Self-contained: yes.

## 1. Context
Admin page exists but lacks code management, global invitations, multi-role assignment, kind badges, tenant selector, consolidated members view.

## 2. Objective
Add UI: ephemeral code CRUD (show raw once), global invitation generation (URL/QR), multi-role assign/remove, kind badge + filter, tenant selector post-login, consolidated Members view (direct add + join requests).

## 3. Files to touch
- apps/web/src/routes/(app)/admin/+page.svelte (+ components)
- apps/web/src/lib/api/admin.ts (extend)
- i18n keys (es/en parity)

## 4. Acceptance criteria
- Admin can manage codes, invitations, roles, members from UI.
- i18n parity maintained.
- build/type-check/test green.