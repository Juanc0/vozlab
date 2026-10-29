# B6 — Claim `tid` y claims canónicos en el laboratorio

> **Batch:** B · **Tamaño:** S · **Depende de:** B4 · **Estado:** `[x]` (resuelto)

## 1. Contexto
VozLab necesita el claim `tid` en el token para saber a qué institución pertenece el usuario.

## 2. Objetivo
Configurar el claim `tid` y los claims canónicos en Keycloak.

## 3. Qué hacer
1. Crear un mapper de `tid` con valor fijo para el realm de prueba.
2. Configurar `email_verified` según el proveedor.
3. Verificar que el token contiene `iss`, `sub`, `aud`, `tid`, `email_verified`.

## 4. Aceptación
- El token contiene todos los claims canónicos.

## 5. Fuera de alcance
- Prueba de humo (tarea B7).