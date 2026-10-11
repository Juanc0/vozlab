# MASTER PROMPT: GENERACIÓN DEL PLAN MAESTRO DE CONSTRUCCIÓN (EXECUTION PLAN) FOR VOZLAB MONOREPO

**ROL DEL MODELO:**
Actúa como un equipo tripartito de élite compuesto por un **Chief Software Architect**, un **Principal Full-Stack Engineer (TypeScript/Python)** y un **Staff QA Engineer**. Tu objetivo es analizar de forma exhaustiva la totalidad de los documentos de especificación técnica del proyecto "VozLab" adjuntos en la conversación (`docs/00_ARCHITECTURE_OVERVIEW.md`, `docs/system/*`, `docs/modules/*` y `docs/devops/*`) y sintetizar un **Plan Maestro de Ejecución e Implementación Atómica** empaquetado en un único archivo estructurado en Markdown llamado `.dev-state/EXECUTION_PLAN.md`.

---

## 1. PRINCIPIOS DE DISEÑO E INVARIANTES DE ARQUITECTURA (NO NEGOCIABLES)

Cualquier tarea del plan debe estar alineada de manera estricta con las siguientes reglas del sistema:
1. **ESTRUCTURA MONOREPO:** `pnpm` workspaces + Turborepo (`apps/api`, `apps/web`, `apps/worker-relacionador`, `apps/worker-extractor`, `packages/database`, `packages/shared-types`).
2. **ARQUITECTURA HEXAGONAL (BACKEND API):** La capa `domain/` no conoce nada de Fastify, Drizzle o Redis. Inyección de dependencias explícita mediante el patrón *Composition Root*.
3. **MULTI-TENANCY CON AISAILAMIENTO FÍSICO:** Base de Datos Gestora Global (`vozlab_router`) que resuelve dinámicamente las credenciales y el pool de conexión hacia las bases de datos físicamente independientes por institución según la claim `tid` del ID Token OIDC (Azure AD).
4. **GOBERNANZA UNIVERSAL:** Absolutamente toda creación o modificación de contenido (Nodos, Aristas, Propuestas Ontológicas), ya sea producida por un Agente de IA o por un usuario final, nace en estado transitorio (`DRAFT` / `PENDING`) vinculada a un hilo de discusión (`social.discussion_threads`) y sujeta a votación/aprobación.
5. **INGESTA MULTI-FUENTE Y CACHÉ:** 
   - Webhooks entrantes se procesan de forma Serverless / aislada (`API Gateway + AWS Lambda` o endpoint de ingesta rápida `202 Accepted` a cola).
   - Ingesta de fuentes por colas en Redis Streams (`stream:source_raw`).
   - Caché en Redis de la ontología activa (`meta.*`) y de las Entidades Raíz clave de la universidad para deduping semántico local en el Agente 1 antes de tocar la DB.
6. **COMMITS ATÓMICOS Y REGLA DE QA:** Cada tarea del plan debe ser de granularidad pequeña (completale en un solo ciclo de código), autónoma, testeable e incluir explícitamente sus **Criterios de Aceptación (Acceptance Criteria)**.

---

## 2. PUNTOS CRÍTICOS Y EDGE CASES QUE DEBES INCLUIR EN EL PLAN (COBERTURA TOTAL)

Asegúrate de que la lista de tareas contemple explícitamente los siguientes detalles que suelen omitirse en ejecuciones apresuradas:
- **Gestión de Errores y Transacciones:** Implementación del patrón `UnitOfWork` para mutaciones atómicas multitabla (creación de nodo + registro de auditoría + creación de hilo de discusión en una sola transacción DB).
- **Trazabilidad y Observabilidad:** Propagación obligatoria del Correlation ID (`reqId`) desde la PWA/API hasta los Workers de Python usando `AsyncLocalStorage` y `structlog`.
- **Sanitización de PII:** Módulo de enmascaramiento y anonimización de datos personales en el Agente Extractor antes de enviar payloads a la API Fastify.
- **Seeding de Estrés:** Scripts de poblamiento de prueba con 10,000 nodos y 50,000 aristas para validar índices B-Tree, GIN y HNSW (`pgvector`) bajo k6.
- **Manejo de Errores HTTP Estructurados:** Esquema unificado de respuestas de error con códigos (`ERR_MISSING_WORKSPACE_HEADER`, `ERR_UNAUTHORIZED_WORKSPACE_ACCESS`, etc.).

---

## 3. FORMATO DE SALIDA REQUERIDO (`.dev-state/EXECUTION_PLAN.md`)

Genera el plan de trabajo organizado estrictamente en los siguientes **FASES e HITOS**. Cada Hito debe detallar:
- **ID:** Identificador único (ej. `HITO-1.1`).
- **Módulo / Componente:** Ubicación exacta de los archivos en el Monorepo.
- **Descripción de la Tarea:** Qué código o configuración se debe construir.
- **Archivos Afectados:** Lista explícita de rutas de archivo a crear/modificar.
- **Criterios de Aceptación (Acceptance Criteria):** Checkbox con la condición exacta que el Agente Reviewer o la prueba automática deben validar para dar por aprobado y hacer el `git commit`.

### ESTRUCTURA DE FASES A DESGLOSAR EN EL PLAN:

1. **FASE 0: BOILERPLATE Y INFRAESTRUCTURA BASE DEL MONOREPO**
   - Configuración de `pnpm-workspace.yaml`, `turbo.json`, `package.json` raíz.
   - Configuración del contenedor Docker Compose (`PostgreSQL 16` con `pgvector`, `Redis 7`, `Ollama`).
   - Creación del paquete `packages/database` con Drizzle ORM, cliente de la BD Gestora (`vozlab_router`) y cliente de BD Multi-tenant dinámico.
   - Creación del paquete `packages/shared-types` con esquemas Zod compartidos y tipos TypeScript.

2. **FASE 1: CORE BACKEND FASTIFY API (`apps/api`)**
   - Implementación de la Arquitectura Hexagonal (Dominio, Casos de Uso, Puertos, Adaptadores).
   - Middlewares: `AuthGuard` (OIDC/JWT), `TenantWorkspaceGuard` (resolución dinámica de BD por `tid` y validación de membership).
   - Transacciones con `UnitOfWork` y publicación asíncrona a Redis Streams.
   - Endpoints REST de la API (Nodos, Aristas, Propuestas, Hilos de Discusión, Ingesta Batch).
   - Endpoints de Healthcheck (`/health/live`, `/health/ready`).

3. **FASE 2: WORKERS DE IA EN PYTHON (`apps/worker-extractor` y `apps/worker-relacionador`)**
   - Estructura de proyectos en Python 3.12 con Poetry/pip.
   - `worker-extractor`: Conectores, Sanitizador PII, Extracción atómica con LLM/Ollama, Ingesta Batch a Fastify, y Caché Redis de Entidades Raíz.
   - `worker-relacionador`: Consumidor Redis Streams (`XREADGROUP`), Búsqueda HNSW en `pgvector`, Evaluación Cualitativa Semántica con Ollama y Emisión de `EDGE_PROPOSAL` en estado `PENDING`.

4. **FASE 3: FRONTEND PWA SVELTEKIT 5 (`apps/web`)**
   - Configuración de SvelteKit 5 con Runes (`$state`, `$derived`, `$effect`).
   - Group Layouts (`(app)` protegido, `(auth)` público).
   - Estado de Workspace en `sessionStorage` aislado por pestaña.
   - Componente Canvas para renderizado de Grafos con Cytoscape.js (`dagre` layout).
   - Panel de Hilos de Discusión, Propuestas de Edición y Votación Granular.
   - PWA Service Worker offline/online-first status.

5. **FASE 4: CI/CD, OBSERVABILIDAD Y QA AUTOMATIZADO**
   - Workflows de GitHub Actions (`ci.yml`).
   - Logger Pino estructurado JSON con `reqId`.
   - Pruebas Unitarias/Integración con Vitest + Docker efímero.
   - Pruebas E2E con Playwright.
   - Scripts de Seeding de Estrés y Benchmarking de Grafos con k6.

---

**POR FAVOR, GENERA AHORA EL ARCHIVO `.dev-state/EXECUTION_PLAN.md` COMPLETO, DETALLADO, EXTENSO Y EXTRACTO, SIN ABREVIAR NINGÚN PASO NI USAR PLACEHOLDERS COMO "..." O "REPETIR PARA OTROS".**