# A5 — Alcance del Extractor: nodos, aristas y lotes

> **Tipo:** decisión · **Tamaño:** S · **Depende de:** nada

## 1. Contexto
Hay que decidir si el Extractor propone aristas y si se acepta un paquete por registro.

## 2. Objetivo
Decidir si el Extractor propone aristas (D7) y si se acepta un paquete por registro (D8).

## 3. Leer primero
- `../01-explicacion-logins-y-ia.md`, sección 12.3.
- `docs/decisions/ADR-0024-no-batch-node-endpoint.md`.
- `docs/decisions/ADR-0026-merge-contract.md`.

## 4. Qué hacer
1. Decidir si el Extractor propone aristas.
2. Decidir si se acepta un paquete por registro.
3. Si D8 se aprueba, la tarea F2 (ADR) va antes de cualquier cambio de API para lotes.

## 5. Aceptación
- Decisión escrita.

## 6. Fuera de alcance
- Implementar el Extractor (bloque E).