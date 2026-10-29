# C8 — HMAC del subject en la base de la institución (opcional, baja prioridad)

> **Batch:** C · **Tamaño:** S · **Depende de:** C3 y de decidir dónde guardar la clave

## 1. Contexto
Evaluar si se guarda el `subject` en claro en la base de la institución. No promete no correlación.

## 2. Objetivo
Decidir si se sustituye el `subject` por un HMAC.

## 3. Leer primero
- `../01-explicacion-logins-y-ia.md`, sección 6.3.

## 4. Qué hacer
Si se aprueba, sustituir `subject` por `subject_hmac` en `external_identities`, con `HMAC-SHA256(clave de la institución, issuer + "|" + subject)`. La búsqueda del login usa `(issuer, subject_hmac)`. El `subject` en claro solo existe en memoria durante el login. No guardes ambos. Si no se aprueba, dejar C3 como está y documentar la decisión.

## 5. Aceptación
- El mismo `(issuer, subject)` en dos instituciones produce valores distintos.
- El `subject` en claro no aparece en la tabla.
- El login sigue funcionando.
- Un test confirma que el `global_identity_id` sigue siendo el mismo.

## 6. Fuera de alcance
- Añadir `subject_hmac` junto al `subject`.