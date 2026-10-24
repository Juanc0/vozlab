# C3 — Tabla de identidades externas `(issuer, subject)`

> **Batch:** C · **Tamaño:** M · **Depende de:** C2

## 1. Contexto
Hay que guardar el emisor junto al `sub` para soportar varios proveedores.

## 2. Objetivo
Crear la tabla `auth.external_identities`.

## 3. Leer primero
- `packages/database/src/schema/tenant.auth.schema.ts` (`users`, 26 a 47).
- `docs/decisions/ADR-0003-drizzle-schema-source-of-truth.md`.
- `docs/decisions/ADR-0018-oidc-jit-hybrid-sessions.md`.

## 4. Qué hacer
1. Añadir la tabla `auth.external_identities`: `id`, `user_id` (FK a `users`, cascade), `issuer` (varchar 512), `subject` (varchar 255), `provider_kind`, `created_at`, `last_login_at`. Índice único `(issuer, subject)` e índice por `user_id`.
2. Generar la migración con `pnpm --filter @vozlab/database db:generate:tenant`.
3. Script de relleno `packages/database/scripts/backfill-external-identities.ts`: recibe el emisor como argumento y usa `ON CONFLICT DO NOTHING`.

## 5. Aceptación
- La migración se aplica sobre una base vacía.
- El relleno se puede ejecutar dos veces con el mismo resultado.

## 6. Fuera de alcance
- Borrar `users.provider_user_id` (se mantiene por compatibilidad).