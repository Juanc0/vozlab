# A8 — Auditoría

> **Tipo:** decisión · **Tamaño:** S · **Depende de:** nada · **Estado:** `[x]` (resuelto)

## 1. Contexto
Hay que decidir retención, quién lee los eventos y si se exige cadena de hashes.

## 2. Objetivo
Decidir la política de auditoría.

## 3. Leer primero
- `../01-explicacion-logins-y-ia.md`, sección 6.6.

## 4. Decisión tomada
- Append-only, sin PII.
- Retención: 1 año en la institución y 2 en el router.
- Sin cadena de hashes: rol restringido + copias de seguridad.
- Actores: USER, AGENT, SYSTEM.
- `request_id` para trazabilidad.

## 5. Qué hacer
1. Confirmar la retención.
2. Confirmar quién lee los eventos.
3. Confirmar si se exige cadena de hashes.

## 6. Aceptación
- Decisión escrita.

## 7. Fuera de alcance
- Implementar auditoría (tarea D11).