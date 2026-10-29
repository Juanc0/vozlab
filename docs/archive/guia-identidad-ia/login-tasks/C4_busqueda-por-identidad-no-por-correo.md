# C4 — Búsqueda por identidad, no por correo

> **Batch:** C · **Tamaño:** M · **Depende de:** C3

## 1. Contexto
Una identidad nueva con un correo ya existente no debe reasignar la cuenta.

## 2. Objetivo
Cambiar `findOrCreateOidcUser` para buscar por `(issuer, subject)`.

## 3. Leer primero
- `apps/api/src/infrastructure/persistence/repositories/DrizzleUserRepository.ts` (77 a 133).
- `apps/api/src/domain/ports/IUserRepository.ts` (`findOrCreateOidcUser`, línea 49).

## 4. Qué hacer
Nuevo método `findOrCreateByExternalIdentity({issuer, subject, email, emailVerified, fullName}, tid)`:
1. Si existe `(issuer, subject)`, actualizar el perfil y devolver el usuario.
2. Si no existe y el correo ya pertenece a otra cuenta, devolver `ERR_ACCOUNT_LINK_CONFLICT`. No reasignar nada.
3. Si no hay correo coincidente, crear la cuenta nueva.
4. Eliminar la reasignación de `provider_user_id` (líneas 122 a 131).

## 5. Aceptación
- Misma identidad, mismo usuario.
- Mismo correo con otro emisor, conflicto.
- Mismo correo con otro `sub` del mismo emisor, conflicto.
- Sin correo, cuenta nueva.

## 6. Fuera de alcance
- Vinculación explícita de proveedores (decisión D5).