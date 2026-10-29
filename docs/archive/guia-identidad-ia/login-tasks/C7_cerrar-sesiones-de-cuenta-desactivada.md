# C7 — Cerrar las sesiones de una cuenta desactivada

> **Batch:** C · **Tamaño:** M · **Depende de:** C3

## 1. Contexto
Una baja en el proveedor no cierra la sesión hasta que caduque el refresh (30 días).

## 2. Objetivo
Que una baja tenga efecto inmediato dentro de VozLab.

## 3. Leer primero
- `../01-explicacion-logins-y-ia.md`, secciones 2.4 y 10.
- ADR-0018 (refresh rotado y bloqueo del `jti`).
- `RefreshSessionUseCase.ts`.
- El middleware de autenticación en `apps/api/src/infrastructure/http/middlewares/`.

## 4. Propuesta (aprobar antes)
Un campo `sessions_valid_after` en `auth.users`. El refresco y el middleware rechazan tokens con `iat` anterior a ese valor. Un comando `db:revoke-sessions -- --user <id>` lo actualiza y revoca las familias de refresco.

## 5. Aceptación
- Tras revocar, un refresco devuelve error.
- Un access token emitido antes deja de valer en la siguiente petición.

## 6. Fuera de alcance
- Desactivar cuentas en el proveedor.