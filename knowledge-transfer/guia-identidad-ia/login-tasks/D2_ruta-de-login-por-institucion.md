# D2 — Ruta de login por institución

> **Batch:** D · **Tamaño:** M · **Depende de:** D1

## 1. Contexto
El login debe poder iniciarse por institución.

## 2. Objetivo
Crear la ruta de login por institución.

## 3. Leer primero
- `apps/api/src/application/use_cases/StartOidcLoginUseCase.ts`.
- `apps/api/src/infrastructure/http/routes.ts`.

## 4. Qué hacer
1. Aceptar un parámetro `institution` en la ruta de inicio de login.
2. Resolver la institución en el router.
3. Redirigir al broker con `kc_idp_hint` si aplica.
4. Guardar la institución en el estado del login (tarea C5).

## 5. Aceptación
- El login se inicia por institución.
- El callback verifica la institución.

## 6. Fuera de alcance
- Invitaciones (tarea D3).