# C5 — El login fija la institución y se comprueba al volver

> **Batch:** C · **Tamaño:** M · **Depende de:** C1

## 1. Contexto
El token de regreso debe pertenecer a la institución que se pidió al iniciar sesión.

## 2. Objetivo
Guardar la institución en el estado del login y verificarla en el callback.

## 3. Leer primero
- `StartOidcLoginUseCase.ts`, `RedisOidcStateStore.ts`.
- `CompleteOidcLoginUseCase.ts` (47 a 71).
- `packages/shared-types/src/errors/http-errors.ts`.

## 4. Qué hacer
1. Aceptar un parámetro opcional `institution` al iniciar el login. Resolverlo a `tenants.oidc_tenant_id` y guardarlo en el estado.
2. Al completar: si el estado tiene institución y `identity.tenantKey` no coincide, devolver `ERR_TENANT_MISMATCH` (nuevo código en `DomainError.ts` y en los códigos compartidos).

## 5. Aceptación
- Sin institución, el comportamiento es el actual.
- Institución distinta, error.
- Institución igual, éxito.

## 6. Fuera de alcance
- Leer la institución desde el navegador en el callback.