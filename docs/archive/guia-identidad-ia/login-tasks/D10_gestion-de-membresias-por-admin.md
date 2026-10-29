# D10 — Gestión de membresías por ADMIN

> **Batch:** D · **Tamaño:** M · **Depende de:** D3, D9, D11

## 1. Contexto
Un `ADMIN` debe poder gestionar las membresías de su workspace.

## 2. Objetivo
Implementar los endpoints de gestión de membresías.

## 3. Leer primero
- `../01-explicacion-logins-y-ia.md`, sección 6.5.
- `docs/auth-and-tenancy.md`.

## 4. Qué hacer
Endpoints bajo `/api/v1/workspaces/:workspaceId/members`: listar, invitar, cambiar rol, suspender, reactivar, expulsar, reenviar y revocar invitación. Todos con `authGuard` + `tenantWorkspaceGuard` + rol `ADMIN`. Actualizar `IMembershipRepository` y `TenantWorkspaceGuard` para que solo `status = 'ACTIVE'` cuente como miembro. Escribir auditoría (D11) en la misma transacción.

## 5. Aceptación
- Pruebas de rol (`MEMBER` y `MODERATOR` reciben 403).
- Aislamiento entre instituciones (404, no 403).
- Un miembro `SUSPENDED` pierde el acceso.
- Cada cambio genera un evento de auditoría.

## 6. Fuera de alcance
- Enumerar usuarios del IdP.