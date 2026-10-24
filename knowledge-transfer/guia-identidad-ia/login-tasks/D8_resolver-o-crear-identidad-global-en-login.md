# D8 — Resolver o crear la identidad global en el login

> **Batch:** D · **Tamaño:** M · **Depende de:** C4, C6, D6

## 1. Contexto
En el login hay que resolver o crear la identidad global.

## 2. Objetivo
Implementar la resolución de la identidad global en el login.

## 3. Leer primero
- `../01-explicacion-logins-y-ia.md`, sección 6.4.
- `CompleteOidcLoginUseCase.ts`.
- `DrizzleUserRepository.ts`.
- `apps/api/src/domain/ports/IRouterDatabase.ts`.
- `apps/api/src/infrastructure/persistence/RouterDatabaseClient.ts`.

## 4. Qué hacer
1. Añadir un puerto `IGlobalIdentityRepository` en `application/` e implementarlo en `RouterDatabaseClient` (como `IEventCodeRepository`). No crear un segundo pool.
2. En `CompleteOidcLoginUseCase`: calcular `(issuer, subject)`, hacer upsert en `global_identities`, obtener `global_identity_id`.
3. Buscar la cuenta local por `(issuer, subject)`. Si no existe, buscar por `global_identity_id`; si aparece, reutilizarla y añadir `external_identities`.
4. Si no existe, crear la cuenta local con `global_identity_id`.
5. Si M2b: upsert de `global_identity_tenants` con `tenant_id`, `user_id` y `status = 'ACTIVE'`.

## 5. Aceptación
- Login repetido no crea otra persona global.
- Cuenta local vinculada correctamente.
- `pnpm turbo run build type-check test` pasa.

## 6. Fuera de alcance
- Canje de invitación (tarea D9).