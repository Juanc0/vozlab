# D6 — Índice global de identidades en el router (M2a)

> **Batch:** D · **Tamaño:** M · **Depende de:** A3, F1

## 1. Contexto
Se necesita un índice global en el router con `(issuer, subject)` → `global_identity_id`.

## 2. Objetivo
Crear la tabla `global_identities` en el router.

## 3. Leer primero
- `../01-explicacion-logins-y-ia.md`, sección 6.4.
- `packages/database/src/schema/router.schema.ts`.

## 4. Qué hacer
1. Añadir la tabla `global_identities`: `id`, `issuer` (varchar 512), `subject` (varchar 255), `created_at`, `last_seen_at`. Único `(issuer, subject)`.
2. Generar la migración con `pnpm --filter @vozlab/database db:generate:router`.
3. Añadir `globalIdentities` a `router.schema.ts`.

## 5. Aceptación
- La migración se aplica sobre una base vacía.
- Una consulta no devuelve correo, nombre ni rol.

## 6. Fuera de alcance
- Vínculo con instituciones (tarea D7).