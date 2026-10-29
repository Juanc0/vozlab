# C2 — `email_verified` ausente deja de contar como verificado

> **Batch:** C · **Tamaño:** M · **Depende de:** C1

## 1. Contexto
Hoy, si el claim `email_verified` falta, se acepta como verificado. Eso es inseguro.

## 2. Objetivo
Distinguir "verificado", "no verificado" y "no afirmado".

## 3. Leer primero
- `IIdentityProvider.ts` (tipo `OidcIdentity`).
- `OidcProviderClient.ts` (138 a 162).
- `CompleteOidcLoginUseCase.ts` (61 a 63).
- `DrizzleUserRepository.ts` (77 a 133).

## 4. Qué hacer
1. Cambiar `emailVerified` a `boolean | null` en `OidcIdentity`. `null` significa que el proveedor no lo afirmó.
2. En `exchangeCode`, devolver `null` cuando el claim falta.
3. Pasar el valor al repositorio. Vincular por correo solo si es `true`. Con `null`, crear cuenta nueva sin vincular.

## 5. Aceptación
- Pruebas nuevas en `CompleteOidcLoginUseCase.test.ts` y `OidcProviderClient.test.ts`.
- `pnpm turbo run build type-check test` pasa.

## 6. Fuera de alcance
- Cambiar el flujo de login.