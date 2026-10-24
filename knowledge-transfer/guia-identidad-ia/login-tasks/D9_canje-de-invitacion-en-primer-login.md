# D9 — Canje de invitación en el primer login

> **Batch:** D · **Tamaño:** M · **Depende de:** D3, D8, D11

## 1. Contexto
La invitación se canjea en el primer login.

## 2. Objetivo
Implementar el canje de invitación.

## 3. Leer primero
- `../01-explicacion-logins-y-ia.md`, sección 6.5.
- `CompleteOidcLoginUseCase.ts`.

## 4. Qué hacer
1. Aceptar el token de invitación en el callback: preferible en una cookie `HttpOnly` de vida corta o dentro del `state` de OIDC.
2. Validar el ID token: firma, `iss`, `aud`, `nonce` y `email_verified === true`.
3. Si la invitación tiene correo: exigir `email_verified === true` y comparar el hash del correo normalizado. Si no coincide, no canjear.
4. En una transacción local: crear o reutilizar `auth.users` (guardando `global_identity_id`), crear `auth.external_identities`, crear `workspace_memberships` con el rol y `status = 'ACTIVE'`, marcar la invitación `ACCEPTED` e incrementar `used_count`.
5. Después del commit: upsert de `global_identity_tenants` (M2b) con `status = 'ACTIVE'`. Si falla, encolar reconciliación (D14).

## 5. Aceptación
- Repetir el canje no duplica membresías ni identidades globales.
- Correo no verificado o no coincidente no canjea.

## 6. Fuera de alcance
- Gestión de membresías (tarea D10).