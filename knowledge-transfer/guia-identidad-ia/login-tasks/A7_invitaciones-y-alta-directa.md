# A7 — Invitaciones y alta directa

> **Tipo:** decisión · **Tamaño:** S · **Depende de:** nada

## 1. Contexto
Hay que decidir cómo se liga una invitación y quién puede invitar.

## 2. Objetivo
Decidir el modo de invitación, quién invita y qué pasa si el correo no coincide.

## 3. Leer primero
- `../01-explicacion-logins-y-ia.md`, sección 6.5.
- `docs/auth-and-tenancy.md` (JIT no da acceso a workspace).

## 4. Decisión tomada
- Por defecto: correo verificado + código de respaldo.
- Invita el `ADMIN` del workspace.
- Alta directa solo para identidades conocidas, en estado `INVITED`.

## 5. Qué hacer
1. Confirmar el modo de invitación.
2. Confirmar quién invita.
3. Confirmar qué pasa si el correo no coincide.

## 6. Aceptación
- Decisión escrita.

## 7. Fuera de alcance
- Implementar invitaciones (tarea D3).