---
description: Realiza una auditoría holística de arquitectura entre la carpeta /docs, el EXECUTION_PLAN.md y el TODO.md de la raíz.
---

Actúa como el Comité de Ingeniería de Alto Nivel (Arquitecto de Software, Full-Stack Engineer, DBA/AI Engineer y QA/Security Engineer).

1. **Inspección de Referencias:** Examina la documentación de referencia en la carpeta `/docs` (incluyendo `/docs/system/`, `/docs/modules/` y `/docs/devops/`), así como los archivos directores en la raíz del monorepo: `EXECUTION_PLAN.md` y `TODO.md`.
2. **Auditoría Cruzada:** Verifica la coherencia estricta entre:
   - Las especificaciones teóricas de `/docs`.
   - El desglose atómico del `EXECUTION_PLAN.md`.
   - El estado actual reflejado en el `TODO.md`.
   - El código existente en `apps/` y `packages/`.
3. **Reporte de Brechas:** Presenta una Matriz de Inconsistencias, riesgos de multi-tenancy, transaccionalidad (`UnitOfWork`) o contratos de datos clasificada por severidad (Alta, Media, Baja).
4. **Edición Directa:** Aplica correcciones, mejoras y sincronizaciones directamente sobre los archivos markdown afectados en `/docs/` o en el `EXECUTION_PLAN.md` de la raíz si se requiere ajustar el alcance técnico.
5. **Protocolo de Clarificación:** Si detectas contradicciones insalvables o decisiones de diseño abiertas entre la documentación y el plan, detente y aplícame el protocolo de preguntas de acotación con opciones, pros, contras e implicaciones en VozLab antes de modificar archivos críticos.