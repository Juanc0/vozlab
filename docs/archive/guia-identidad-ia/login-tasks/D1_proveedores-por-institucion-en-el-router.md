# D1 — Proveedores de identidad por institución, en el router

> **Batch:** D · **Tamaño:** M · **Depende de:** nada

## 1. Contexto
El router debe saber qué proveedores usa cada institución.

## 2. Objetivo
Añadir la configuración de proveedores por institución en el router.

## 3. Leer primero
- `packages/database/src/schema/router.schema.ts` (`tenants`, `tenant_connections`).
- `apps/api/src/infrastructure/persistence/RouterDatabaseClient.ts`.

## 4. Qué hacer
1. Añadir tabla `tenant_identity_providers` en el router: `id`, `tenant_id`, `provider_kind` (`OIDC_INSTITUTIONAL`, `OIDC_SOCIAL`, `SAML`, `LDAP`), `issuer`, `client_id`, `metadata_url`, `enabled`, `created_at`.
2. Generar la migración con `pnpm --filter @vozlab/database db:generate:router`.
3. Exponer un puerto `ITenantIdentityProviderRepository` en `application/`.

## 5. Aceptación
- La migración se aplica sobre una base vacía.
- El puerto se puede inyectar en los casos de uso.

## 6. Fuera de alcance
- Ruta de login (tarea D2).