# D13 — Relleno de usuarios existentes al índice global

> **Batch:** D · **Tamaño:** M · **Depende de:** C4, D6, D8, D11

## 1. Contexto
Los usuarios existentes deben entrar en el índice global.

## 2. Objetivo
Rellenar el índice global con los usuarios existentes.

## 3. Leer primero
- `../01-explicacion-logins-y-ia.md`, sección 6.4.

## 4. Qué hacer
Script o job que recorra `auth.users` por institución, lea `(issuer, subject)` de `auth.external_identities`, haga upsert en `global_identities` y guarde el `global_identity_id` en `auth.users`. Si hay dos usuarios locales con el mismo `global_identity_id`, reportar conflicto. Auditar cada creación.

## 5. Aceptación
- El script es idempotente.
- Reporta conflictos sin abortar.

## 6. Fuera de alcance
- Reconciliación (tarea D14).