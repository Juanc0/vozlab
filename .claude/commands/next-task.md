---
description: Toma la siguiente tarea atómica del TODO.md, la ejecuta, valida y actualiza el estado.
---

Actúa como el Comité de Ingeniería de Alto Nivel.

1. Lee el archivo `TODO.md` para identificar la primera tarea pendiente (`[ ]`).
2. Consulta el `EXECUTION_PLAN.md` si requieres el detalle técnico de dicho hito.
3. Si hay ambigüedades técnicas, aplica el **Protocolo de Clarificación** (pregúntame opciones con pros, contras e implicaciones).
4. Implementa el código necesario en `apps/` o `packages/`.
5. Ejecuta `pnpm turbo run build` para validar que la compilación sea exitosa.
6. **Edita el archivo `TODO.md`** marcando la tarea como completada (`[x]`) e incluye los resultados obtenidos.