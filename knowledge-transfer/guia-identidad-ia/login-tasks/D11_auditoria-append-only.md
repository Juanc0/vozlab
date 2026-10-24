# D11 — Auditoría append-only de membresías e identidad global

> **Batch:** D · **Tamaño:** M · **Depende de:** D6, D8

## 1. Contexto
Hay que auditar los cambios de membresía y de identidad global.

## 2. Objetivo
Crear las tablas de auditoría append-only.

## 3. Leer primero
- `../01-explicacion-logins-y-ia.md`, sección 6.6.
- `packages/database/src/schema/tenant.auth.schema.ts`.
- `packages/database/src/schema/router.schema.ts`.
- `apps/api/src/infrastructure/persistence/RouterDatabaseClient.ts`.

## 4. Qué hacer
1. Tenant: `auth.membership_events` con `id`, `workspace_id`, `user_id` (nullable), `invitation_id` (nullable), `actor_type`, `actor_id` (nullable), `action`, `before_role`, `after_role`, `reason`, `request_id`, `created_at`.
2. Router: `global_identity_events` con `id`, `global_identity_id`, `tenant_id` (nullable), `actor_type`, `actor_id` (nullable), `action`, `metadata` JSONB, `request_id`, `created_at`.
3. El rol de la aplicación solo puede insertar. No hay `UPDATE` ni `DELETE`.
4. Guardar los IDs como valores; borrar un usuario no debe borrar la auditoría.
5. Sin PII: IDs, roles y estados.

## 5. Aceptación
- Cada acción de D3/D8/D9/D10 escribe su evento en la transacción correspondiente.
- Un evento `INVITED` tiene `user_id = NULL` y `invitation_id`.
- Un intento de `UPDATE` o `DELETE` falla.
- Los eventos de A no son legibles desde B.

## 6. Fuera de alcance
- Cadena de hashes (no se exige).