# C1 — Pruebas de contrato del adaptador OIDC

> **Batch:** C · **Tamaño:** S · **Depende de:** nada

## 1. Contexto
El adaptador OIDC debe rechazar tokens inválidos.

## 2. Objetivo
Cubrir los casos de ataque básicos en `OidcProviderClient`.

## 3. Leer primero
- `apps/api/src/infrastructure/identity/OidcProviderClient.ts` (109 a 171 y 221 a 244).
- `apps/api/tests/infrastructure/OidcProviderClient.test.ts`.

## 4. Qué hacer
Añadir pruebas para: firma con clave desconocida; `iss` distinto; `aud` distinto; `alg: none`; `nonce` distinto; `email_verified: false` (debe dar `ERR_EMAIL_NOT_VERIFIED`); sin `tid` ni `hd` (debe dar `ERR_OIDC_EXCHANGE_FAILED`); con `tid` y `hd` a la vez (gana `tid`).

## 5. Aceptación
- `pnpm --filter @vozlab/api test` pasa.
- Cada caso falla si se rompe la validación que prueba.

## 6. Fuera de alcance
- Cambiar el comportamiento del adaptador.