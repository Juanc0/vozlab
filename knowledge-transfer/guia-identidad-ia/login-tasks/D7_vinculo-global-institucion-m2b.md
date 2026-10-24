# D7 — Vínculo global ↔ institución (M2b)

> **Batch:** D · **Tamaño:** M · **Depende de:** D6

## 1. Contexto
M2b añade la pertenencia: `global_identity_id → tenant_id`.

## 2. Objetivo
Crear la tabla `global_identity_tenants` y el vínculo en la base de la institución.

## 3. Leer primero
- `../01-explicacion-logins-y-ia.md`, sección 6.4.

## 4. Qué hacer
1. En el router, crear `global_identity_tenants`: `global_identity_id`, `tenant_id`, `tenant_user_id`, `status` (`ACTIVE`, `SUSPENDED`, `LEFT`), `first_seen_at`, `last_seen_at`. Únicos `(global_identity_id, tenant_id)` y `(tenant_id, tenant_user_id)`.
2. En cada tenant, añadir `auth.users.global_identity_id uuid` nullable con índice único parcial (`WHERE global_identity_id IS NOT NULL`).
3. No hay FK entre bases.

## 5. Aceptación
- Dos instituciones pueden apuntar a la misma identidad global.
- El mismo `tenant_user_id` no se repite dentro de una institución.
- Dos usuarios locales con el mismo `global_identity_id` fallan.

## 6. Fuera de alcance
- Resolver la identidad en el login (tarea D8).