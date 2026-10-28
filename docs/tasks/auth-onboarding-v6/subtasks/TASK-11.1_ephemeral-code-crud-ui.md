# TASK-11.1 — Ephemeral code CRUD UI

> Size: M · Depends on: TASK-04 (backend)

## Scope
- List codes for selected workspace.
- Create code form (label, expiresAt, maxUses, autoApprove) → show raw code once.
- Revoke code button.
- i18n keys.

## Files
- apps/web/src/lib/api/admin.ts (list/revoke code functions)
- apps/web/src/routes/(app)/admin/+page.svelte
- i18n locales