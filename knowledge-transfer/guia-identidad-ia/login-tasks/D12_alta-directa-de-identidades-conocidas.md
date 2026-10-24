# D12 — Alta directa de identidades conocidas

> **Batch:** D · **Tamaño:** S · **Depende de:** D8, D10, D11

## 1. Contexto
Un `ADMIN` puede agregar a una persona ya conocida a su workspace.

## 2. Objetivo
Implementar el alta directa de identidades conocidas.

## 3. Leer primero
- `../01-explicacion-logins-y-ia.md`, sección 6.5.

## 4. Qué hacer
Endpoint que reciba `global_identity_id`, `workspace_id` y rol. Verificar que la identidad existe. Leer del router su `(issuer, subject)`. Crear la membresía en estado `INVITED` (decisión A7). Auditar. Si el usuario local no existe, crear una fila mínima sin correo, con `global_identity_id`, `provider = 'OIDC_INSTITUTIONAL'`, `provider_user_id = subject` y `auth.external_identities`. `auth.users` exige `provider` y `author_hash`: usar valores válidos y un `author_hash` aleatorio, nunca derivado del correo.

## 5. Aceptación
- Identidad inexistente devuelve error.
- El primer login reutiliza la cuenta.
- `pnpm turbo run build type-check test` pasa.

## 6. Fuera de alcance
- Buscar en el índice global por correo.