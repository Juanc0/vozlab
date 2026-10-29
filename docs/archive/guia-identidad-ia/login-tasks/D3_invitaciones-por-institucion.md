# D3 — Invitaciones por institución: tabla y alta

> **Batch:** D · **Tamaño:** M · **Depende de:** C3, D11

## 1. Contexto
Un `ADMIN` debe poder crear, reenviar y revocar invitaciones.

## 2. Objetivo
Crear la tabla `auth.invitations` y la alta de invitaciones.

## 3. Leer primero
- `../01-explicacion-logins-y-ia.md`, sección 6.5.
- `packages/database/src/schema/tenant.auth.schema.ts` (`workspace_memberships`, 49 a 70).
- `docs/auth-and-tenancy.md`.

## 4. Qué hacer
1. Crear `auth.invitations`: `id`, `workspace_id`, `email` (nullable), `email_hash` (nullable), `role`, `token_hash`, `expires_at`, `max_uses`, `used_count`, `status` (`PENDING`, `ACCEPTED`, `REVOKED`, `EXPIRED`), `revoked_at`, `created_by`, `created_at`. Índice único por `token_hash` e índice por `workspace_id`. Si `email` no es `NULL`, `email_hash` es obligatorio.
2. Generar un token aleatorio de un solo uso; guardar solo su SHA-256 y devolverlo una vez.
3. Reenviar genera un token nuevo y rota el hash.
4. Añadir `status` a `auth.workspace_memberships` con default `ACTIVE` (`INVITED`, `ACTIVE`, `SUSPENDED`, `REMOVED`).
5. Auditar `INVITED` y `INVITATION_REVOKED` con `invitation_id` y `user_id = NULL`.

## 5. Aceptación
- Un `ADMIN` crea una invitación y recibe el token una vez.
- Reenviar rota el token.
- `pnpm turbo run build type-check test` pasa.

## 6. Fuera de alcance
- Canje de invitación (tarea D9).