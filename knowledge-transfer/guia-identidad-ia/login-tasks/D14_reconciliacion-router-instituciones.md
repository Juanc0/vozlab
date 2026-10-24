# D14 — Reconciliación router ↔ instituciones

> **Batch:** D · **Tamaño:** S · **Depende de:** D7, D9, D10, D11

## 1. Contexto
El índice global y la cuenta local no comparten transacción. Hay que reconciliar.

## 2. Objetivo
Crear un job de reconciliación entre el router y las instituciones.

## 3. Leer primero
- `../01-explicacion-logins-y-ia.md`, sección 6.5.

## 4. Qué hacer
Script o job que compare `auth.users.global_identity_id` y el estado agregado de `workspace_memberships` con `global_identity_tenants`. Crear los vínculos faltantes, calcular el estado del tenant (`ACTIVE` si hay al menos una membresía `ACTIVE`; `SUSPENDED` si no hay `ACTIVE` pero hay alguna `SUSPENDED`; `LEFT` si todas están `REMOVED` o no hay ninguna). Usar la base local como fuente de verdad, marcar huérfanos y emitir un informe sin PII. Idempotente.

## 5. Aceptación
- El job es idempotente.
- Reporta huérfanos sin PII.

## 6. Fuera de alcance
- Programar el job (definir frecuencia).