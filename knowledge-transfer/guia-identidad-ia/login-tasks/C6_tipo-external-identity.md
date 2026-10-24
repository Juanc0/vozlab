# C6 — Tipo `ExternalIdentity` (normalización sin cambio de comportamiento)

> **Batch:** C · **Tamaño:** S · **Depende de:** C2

## 1. Contexto
Hay que unificar el tipo que describe cualquier identidad externa para preparar SAML y LDAP.

## 2. Objetivo
Crear el tipo `ExternalIdentity` en el dominio.

## 3. Leer primero
- `IIdentityProvider.ts`.
- `../01-explicacion-logins-y-ia.md`, sección 8.2.

## 4. Qué hacer
Crear el tipo en `apps/api/src/domain/` (sin dependencias de infraestructura) con `issuer`, `subject`, `email`, `emailVerified` (`true | false | null`), `fullName`, `tenantKey` y `providerKind`. Adaptar `OidcProviderClient` para devolverlo.

## 5. Aceptación
- `pnpm turbo run build type-check test` pasa sin cambiar las pruebas existentes.

## 6. Fuera de alcance
- Implementar SAML o LDAP.