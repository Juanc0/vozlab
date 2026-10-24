# A3 — Índice global: alcance y privacidad

> **Tipo:** decisión · **Tamaño:** S · **Depende de:** nada

## 1. Contexto
Ya existe un índice por tenant para autorizar roles por workspace. Se propone un índice global en el router con `(proveedor, id-único-usuario)`, sin correo.

## 2. Objetivo
Confirmar M2a (solo identidades) y M2b (identidades + pertenencia), la finalidad, la base legal y la retención.

## 3. Leer primero
- `../01-explicacion-logins-y-ia.md`, secciones 6, 6.3 y 6.4.
- `docs/decisions/ADR-0013-random-opaque-pseudonym.md`.
- D-23 en `knowledge-transfer/15-decision-register-and-roadmap.md`.

## 4. Decisión tomada
**M2a siempre y M2b también** (pertenencia en el router). Revisión jurídica diferida por decisión del usuario.

## 5. Qué hacer
1. Escribir la decisión en el borrador del ADR de F1.
2. Si se añade M2b, documentar la evaluación de privacidad (finalidad, base legal, retención, acceso).

## 6. Aceptación
- Decisión escrita con alcance, finalidad, retención y responsable.

## 7. Fuera de alcance
- Implementar las tablas (tareas D6/D7).