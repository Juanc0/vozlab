---
title: Plan Maestro de Ejecución e Implementación Atómica (VozLab)
version: 1.0.0
status: APPROVED
owner: Chief Software Architect, Principal Full-Stack Engineer, Staff QA Engineer
---

Este documento define el roadmap exhaustivo y atómico para la construcción del monorepo de VozLab. Cada hito representa una unidad lógica de trabajo (PR/Commit) diseñada bajo restricciones estrictas de aislamiento multi-tenant físico, transaccionalidad mediante `UnitOfWork` y arquitecturas hexagonales.

---

## FASE 0: BOILERPLATE E INFRAESTRUCTURA BASE DEL MONOREPO

### HITO-0.1: Inicialización del Monorepo y Herramientas Base
- **Módulo / Componente:** Raíz del Proyecto
- **Descripción de la Tarea:** Configurar el workspace de `pnpm`, Turborepo y las dependencias de desarrollo globales (TypeScript, ESLint, Prettier).
- **Archivos Afectados:**
  - `pnpm-workspace.yaml`
  - `turbo.json`
  - `package.json`
  - `.eslintrc.js`
  - `.prettierrc`
  - `packages/ts-config/base.json`
  - `packages/ts-config/package.json`
- **Criterios de Aceptación:**
  - [ ] `pnpm install` finaliza sin errores en la raíz.
  - [ ] `pnpm turbo run build` ejecuta exitosamente simulando los paquetes vacíos.
  - [ ] `pnpm-workspace.yaml` incluye `apps/*` y `packages/*`.

### HITO-0.2: Orquestación de Contenedores Locales (DB, Redis, LLM)
- **Módulo / Componente:** Infraestructura Local (`docker-compose.yml`)
- **Descripción de la Tarea:** Levantar los servicios base requeridos para desarrollo y pruebas de integración (PostgreSQL con Apache AGE y pgvector, Redis Streams, Ollama).
- **Archivos Afectados:**
  - `docker-compose.yml`
  - `packages/database/scripts/init-age.sql`
- **Criterios de Aceptación:**
  - [ ] `docker compose up -d` levanta Postgres, Redis y Ollama correctamente.
  - [ ] El script de inicialización SQL ejecuta `CREATE EXTENSION IF NOT EXISTS "age";` y `CREATE EXTENSION IF NOT EXISTS "vector";`.
  - [ ] Ollama expone el puerto 11434 y Postgres el 5432.

### HITO-0.3: Definición de Shared Types, Zod Schemas y Errores Estructurados
- **Módulo / Componente:** `packages/shared-types`
- **Descripción de la Tarea:** Crear la librería centralizada de tipos TypeScript, validaciones Zod para DTOs (creación de nodos, votación, propuestas) y el diccionario estricto de códigos de error HTTP.
- **Archivos Afectados:**
  - `packages/shared-types/package.json`
  - `packages/shared-types/src/index.ts`
  - `packages/shared-types/src/schemas/node.schema.ts`
  - `packages/shared-types/src/schemas/proposal.schema.ts`
  - `packages/shared-types/src/errors/http-errors.ts` (ej. `ERR_MISSING_WORKSPACE_HEADER`, `ERR_TENANT_NOT_PROVISIONED`)
- **Criterios de Aceptación:**
  - [ ] Se exportan esquemas Zod con validación estricta de UUIDs y strings.
  - [ ] Los códigos de error están definidos en un `enum` o `const` unificado para evitar magic strings.

### HITO-0.4: Persistencia Drizzle ORM - Esquemas Router y Tenant
- **Módulo / Componente:** `packages/database`
- **Descripción de la Tarea:** Construir el mapeo ORM separando estrictamente la BD Gestora Global (`vozlab_router` para `auth.tenants`) de la BD Física del Tenant (`auth.workspaces`, `meta.*`, `public.*`). Configuración de `deleted_at` para soft-deletes.
- **Archivos Afectados:**
  - `packages/database/package.json`
  - `packages/database/drizzle.config.ts`
  - `packages/database/src/schema/router.schema.ts` (Tabla `tenants` global)
  - `packages/database/src/schema/tenant.auth.schema.ts`
  - `packages/database/src/schema/tenant.meta.schema.ts`
  - `packages/database/src/schema/tenant.public.schema.ts` (Nodos, Edges con `deleted_at`, Proposals, Interactions)
  - `packages/database/src/index.ts`
- **Criterios de Aceptación:**
  - [ ] El esquema de Nodos incluye el tipo personalizado `vector(768)` para pgvector.
  - [ ] No existen dependencias cruzadas entre el esquema Router y el esquema Tenant.
  - [ ] La generación de migraciones con `drizzle-kit` corre exitosamente.

---

## FASE 1: CORE BACKEND FASTIFY API (`apps/api`)

### HITO-1.1: Scaffolding API y Logger Estructurado con `reqId`
- **Módulo / Componente:** `apps/api/src/shared` e `infrastructure/http`
- **Descripción de la Tarea:** Inicializar servidor Fastify configurando `pino` para logging JSON e implementando `AsyncLocalStorage` para inyectar automáticamente el Correlation ID (`reqId`).
- **Archivos Afectados:**
  - `apps/api/package.json`
  - `apps/api/src/shared/logger/index.ts`
  - `apps/api/src/shared/config/env.ts` (Zod ENV validation)
  - `apps/api/src/infrastructure/http/server.ts`
  - `apps/api/src/infrastructure/http/middlewares/CorrelationGuard.ts`
- **Criterios de Aceptación:**
  - [ ] Todo log disparado mediante el logger incluye `{ "reqId": "..." }` dinámicamente.
  - [ ] El servidor lee variables de entorno fuertemente tipadas y falla al inicio si falta alguna.

### HITO-1.2: Capa de Dominio (Hexagonal Core)
- **Módulo / Componente:** `apps/api/src/domain`
- **Descripción de la Tarea:** Definición de interfaces puras sin dependencias externas (Puertos), Value Objects y Entidades ricas.
- **Archivos Afectados:**
  - `apps/api/src/domain/entities/Node.ts`
  - `apps/api/src/domain/entities/EditProposal.ts`
  - `apps/api/src/domain/value_objects/AuthorHash.ts`
  - `apps/api/src/domain/ports/INodeRepository.ts`
  - `apps/api/src/domain/ports/IUnitOfWork.ts`
  - `apps/api/src/domain/ports/IRouterDatabase.ts`
- **Criterios de Aceptación:**
  - [ ] Ningún archivo dentro de `domain/` importa librerías como Fastify, Drizzle o Postgres.
  - [ ] Las reglas de transición de estados (`DRAFT` -> `PENDING` -> `ACTIVE`) están en métodos de la entidad.

### HITO-1.3: Adaptadores de Persistencia y Multi-Tenant Pool Manager
- **Módulo / Componente:** `apps/api/src/infrastructure/persistence`
- **Descripción de la Tarea:** Implementar un gestor de caché de conexiones Drizzle que resuelva credenciales físicas consultando al `vozlab_router` según `tid`. Implementar patrón `UnitOfWork`.
- **Archivos Afectados:**
  - `apps/api/src/infrastructure/persistence/ConnectionPoolManager.ts`
  - `apps/api/src/infrastructure/persistence/RouterDatabaseClient.ts`
  - `apps/api/src/infrastructure/persistence/UnitOfWork.ts`
  - `apps/api/src/infrastructure/persistence/repositories/DrizzleNodeRepository.ts`
- **Criterios de Aceptación:**
  - [ ] `ConnectionPoolManager` reutiliza pools activos por `tid` y los cierra tras inactividad.
  - [ ] `UnitOfWork` provee un objeto de transacción (`tx`) que los repositorios pueden consumir para ejecutar queries atómicas.

### HITO-1.4: Middlewares de Identidad y Aislamiento (Zero-Trust)
- **Módulo / Componente:** `apps/api/src/infrastructure/http/middlewares`
- **Descripción de la Tarea:** Validar JWT firmado, extraer `tid`, inyectar el Pool de BD correspondiente y verificar la pertenencia al Workspace (`X-Workspace-ID`). Blacklist de Redis.
- **Archivos Afectados:**
  - `apps/api/src/infrastructure/http/middlewares/AuthGuard.ts`
  - `apps/api/src/infrastructure/http/middlewares/TenantWorkspaceGuard.ts`
  - `apps/api/src/infrastructure/events/RedisTokenBlacklist.ts`
- **Criterios de Aceptación:**
  - [ ] Petición sin `X-Workspace-ID` devuelve HTTP 400 estandarizado.
  - [ ] Si `tid` no existe en la BD Router, devuelve HTTP 403 `ERR_TENANT_NOT_PROVISIONED`.
  - [ ] Token en Blacklist de Redis provoca HTTP 401 inmediato ($\mathcal{O}(1)$).

### HITO-1.5: Casos de Uso y Controladores REST (Gobernanza)
- **Módulo / Componente:** `apps/api/src/application/use_cases` y `infrastructure/http/controllers`
- **Descripción de la Tarea:** Implementar flujo de creación de nodos, propuestas y endpoints de healthcheck utilizando patrón Composition Root. Publicación en Redis Streams post-commit.
- **Archivos Afectados:**
  - `apps/api/src/application/use_cases/CreateNodeUseCase.ts`
  - `apps/api/src/application/use_cases/ApproveProposalUseCase.ts`
  - `apps/api/src/infrastructure/http/controllers/NodeController.ts`
  - `apps/api/src/infrastructure/http/controllers/HealthController.ts`
  - `apps/api/src/infrastructure/http/routes.ts`
  - `apps/api/src/infrastructure/events/RedisEventPublisher.ts`
- **Criterios de Aceptación:**
  - [ ] `CreateNodeUseCase` guarda el nodo y emite el evento asíncrono `stream:node_created` a Redis (incluyendo `reqId`).
  - [ ] `ApproveProposalUseCase` envuelve actualización de nodo y cambio de estado de la propuesta dentro del `UnitOfWork`.
  - [ ] `/health/ready` verifica conectividad a DB Router y Redis.

---

## FASE 2: WORKERS DE IA EN PYTHON

### HITO-2.1: Inicialización de Entorno Python y Base Común
- **Módulo / Componente:** `apps/worker-extractor` y `apps/worker-relacionador`
- **Descripción de la Tarea:** Crear los proyectos Python 3.12 con Poetry, instalar dependencias base (httpx, psycopg3, redis-py, pydantic) y estructurar logs con `structlog`.
- **Archivos Afectados:**
  - `apps/worker-extractor/pyproject.toml`
  - `apps/worker-relacionador/pyproject.toml`
  - `apps/worker-extractor/src/logger.py`
  - `apps/worker-relacionador/src/logger.py`
- **Criterios de Aceptación:**
  - [ ] Ambientes virtuales de Poetry instalan sin errores.
  - [ ] `structlog` está configurado para leer y escupir JSON con el campo `reqId`.

### HITO-2.2: Worker Extractor - Consumo, Deduping y Caché
- **Módulo / Componente:** `apps/worker-extractor/src`
- **Descripción de la Tarea:** Consumidor de webhooks (simulados vía cola Redis `stream:source_raw`). Implementar deduplicación semántica inicial contra entidades raíz oxidadas en caché Redis.
- **Archivos Afectados:**
  - `apps/worker-extractor/src/redis_client.py`
  - `apps/worker-extractor/src/main.py`
  - `apps/worker-extractor/src/cache_manager.py`
- **Criterios de Aceptación:**
  - [ ] El worker lee mensajes de la cola usando `XREADGROUP` y hace `XACK` solo al finalizar el proceso exitosamente.
  - [ ] Consulta caché local antes de proceder con el parseo.

### HITO-2.3: Worker Extractor - Sanitización PII y LLM
- **Módulo / Componente:** `apps/worker-extractor/src`
- **Descripción de la Tarea:** Filtro de PII y módulo de prompting con Ollama para estructurar JSON atómico a partir del texto crudo.
- **Archivos Afectados:**
  - `apps/worker-extractor/src/sanitizer.py`
  - `apps/worker-extractor/src/extractor_llm.py`
- **Criterios de Aceptación:**
  - [ ] Nombres, emails y cédulas son reemplazados por `[MASKED]` ANTES de enviarse a Ollama.
  - [ ] El parser devuelve estrictamente el modelo Pydantic `ExtractedNodePayload`.

### HITO-2.4: Worker Extractor - Cliente API Batch
- **Módulo / Componente:** `apps/worker-extractor/src`
- **Descripción de la Tarea:** Cliente HTTP para enviar los nodos homogeneizados a Fastify inyectando JWT de bot y headers requeridos.
- **Archivos Afectados:**
  - `apps/worker-extractor/src/api_client.py`
- **Criterios de Aceptación:**
  - [ ] Incluye `X-Workspace-ID` y Correlation ID `x-correlation-id` en los headers de la petición REST hacia Fastify.

### HITO-2.5: Worker Relacionador - Consumo y Búsqueda HNSW
- **Módulo / Componente:** `apps/worker-relacionador/src`
- **Descripción de la Tarea:** Consumidor de `stream:node_created`. Conexión a la DB física del Tenant (psycopg3) para ejecutar búsqueda vectorial en pgvector limitada a los top 5 vecinos.
- **Archivos Afectados:**
  - `apps/worker-relacionador/src/main.py`
  - `apps/worker-relacionador/src/db_client.py`
- **Criterios de Aceptación:**
  - [ ] Ejecuta consulta SQL usando el operador `<=>` (similitud coseno) filtrada estrictamente por `workspace_id`.
  - [ ] Maneja fallas de conexión a PostgreSQL re-encolando el mensaje en la Pending Entries List (PEL) de Redis.

### HITO-2.6: Worker Relacionador - Evaluación LLM y Acción
- **Módulo / Componente:** `apps/worker-relacionador/src`
- **Descripción de la Tarea:** Evaluar la relación semántica de los vecinos vía Ollama. Si hay similitud fuerte, enviar una `EDGE_PROPOSAL` (o `MERGED_INTO`) hacia la API Fastify.
- **Archivos Afectados:**
  - `apps/worker-relacionador/src/evaluator.py`
  - `apps/worker-relacionador/src/api_client.py`
- **Criterios de Aceptación:**
  - [ ] Si la respuesta del LLM es `EDGE`, hace POST a `/api/v1/proposals` para sugerir la relación en estado `PENDING`. No crea aristas activas directamente.

---

## FASE 3: FRONTEND PWA SVELTEKIT 5 (`apps/web`)

### HITO-3.1: Configuración SvelteKit 5, Tailwind y PWA Plugin
- **Módulo / Componente:** `apps/web`
- **Descripción de la Tarea:** Andamiaje inicial del frontend con SvelteKit 5, integración de TailwindCSS y configuración del service worker de Vite PWA.
- **Archivos Afectados:**
  - `apps/web/package.json`
  - `apps/web/svelte.config.js`
  - `apps/web/vite.config.ts`
  - `apps/web/tailwind.config.js`
  - `apps/web/src/app.html`
- **Criterios de Aceptación:**
  - [ ] El servidor compila y arranca en modo SSR.
  - [ ] El manifest PWA se genera y el Service Worker intercepta peticiones.

### HITO-3.2: Estado Global Reactivo (Svelte Runes) y Aislamiento por Pestaña
- **Módulo / Componente:** `apps/web/src/lib/state`
- **Descripción de la Tarea:** Implementar clases de estado con runes (`$state`, `$derived`) y acoplar el `workspaceId` al `sessionStorage`. Interceptor de fetch genérico.
- **Archivos Afectados:**
  - `apps/web/src/lib/state/workspace.svelte.ts`
  - `apps/web/src/lib/api/httpClient.ts`
- **Criterios de Aceptación:**
  - [ ] Al cambiar de Workspace en una pestaña, no afecta el estado de otra pestaña abierta.
  - [ ] `httpClient` inyecta automáticamente el header `X-Workspace-ID` y lee del `sessionStorage`.

### HITO-3.3: Enrutamiento mediante Group Layouts
- **Módulo / Componente:** `apps/web/src/routes`
- **Descripción de la Tarea:** Separación de rutas públicas (SSO Login, Event QR) y privadas (Grafo, Propuestas).
- **Archivos Afectados:**
  - `apps/web/src/routes/(auth)/login/+page.svelte`
  - `apps/web/src/routes/(auth)/join/+page.svelte`
  - `apps/web/src/routes/(app)/+layout.svelte`
  - `apps/web/src/routes/(app)/+page.svelte` (Canvas View)
- **Criterios de Aceptación:**
  - [ ] `(app)/+layout.svelte` redirige a `/login` si no hay sesión activa detectada.

### HITO-3.4: Motor de Renderizado de Grafo (Cytoscape.js)
- **Módulo / Componente:** `apps/web/src/lib/components`
- **Descripción de la Tarea:** Componente reactivo (`$effect`) que inicializa el lienzo del grafo usando el motor `dagre` de Cytoscape.js.
- **Archivos Afectados:**
  - `apps/web/src/lib/components/GraphCanvas.svelte`
- **Criterios de Aceptación:**
  - [ ] Renderiza un array de Nodos y Edges pasados por `$props` aplicando estilos de Tailwind/Colores institucionales.
  - [ ] Clic en un nodo emite un evento custom o actualiza el estado para abrir el panel lateral de detalles.

### HITO-3.5: Paneles de Gobernanza y Hilos de Discusión
- **Módulo / Componente:** `apps/web/src/routes/(app)/proposals` y `discussions`
- **Descripción de la Tarea:** Interfaz de usuario para visualizar Pull Requests de conocimiento, votar (upvote/downvote) y aprobar o rechazar (si el usuario es el autor original).
- **Archivos Afectados:**
  - `apps/web/src/routes/(app)/proposals/+page.svelte`
  - `apps/web/src/lib/components/DiscussionThread.svelte`
  - `apps/web/src/lib/components/VoteControls.svelte`
- **Criterios de Aceptación:**
  - [ ] El botón de "Aprobar Fusión" solo se habilita si el `author_hash` local coincide con el del nodo destino.
  - [ ] La votación desencadena una mutación optimista en el frontend antes de confirmar la petición HTTP 200.

---

## FASE 4: CI/CD, OBSERVABILIDAD Y QA AUTOMATIZADO

### HITO-4.1: Pruebas Unitarias Estrictas (Dominio y Tipos)
- **Módulo / Componente:** `apps/api` y `packages/shared-types`
- **Descripción de la Tarea:** Setup de Vitest para validar comportamientos de negocio y reglas de validación sin tocar base de datos.
- **Archivos Afectados:**
  - `apps/api/vitest.config.ts`
  - `apps/api/tests/domain/Node.spec.ts`
  - `apps/api/tests/application/ApproveProposalUseCase.spec.ts` (Usando mocks In-Memory)
- **Criterios de Aceptación:**
  - [ ] Cobertura de tests > 85% en las carpetas `domain` y `application`.
  - [ ] Fallos intencionales (ej. transiciones inválidas de estado) lanzan el error de dominio correspondiente.

### HITO-4.2: Pruebas de Integración (Base de Datos Efímera)
- **Módulo / Componente:** `apps/api/tests/integration`
- **Descripción de la Tarea:** Pruebas contra un contenedor Docker levantado programáticamente (Testcontainers o setup de script) evaluando Drizzle, UnitOfWork y Redis.
- **Archivos Afectados:**
  - `apps/api/tests/setup-integration.ts`
  - `apps/api/tests/integration/DrizzleNodeRepository.spec.ts`
- **Criterios de Aceptación:**
  - [ ] Se verifica que `UnitOfWork` realmente ejecuta `ROLLBACK` en la base de datos si ocurre un throw dentro del callback.

### HITO-4.3: Pruebas End-to-End Críticas (Playwright)
- **Módulo / Componente:** `apps/web/tests`
- **Descripción de la Tarea:** Automatizar el flujo de usuario crítico: Login -> Crear Nodo -> Sugerir Arista -> Aprobar.
- **Archivos Afectados:**
  - `apps/web/playwright.config.ts`
  - `apps/web/tests/e2e/governance-flow.spec.ts`
- **Criterios de Aceptación:**
  - [ ] El bot de Playwright logra completar el ciclo de vida sin errores de JS en la consola del navegador.

### HITO-4.4: Seeding de Estrés y Benchmarking de Grafos (k6)
- **Módulo / Componente:** `packages/database/scripts` y `tests/load`
- **Descripción de la Tarea:** Script Drizzle para inyectar 10,000 Nodos y 50,000 Aristas. Script k6 para probar concurrencia de consultas de subgrafos.
- **Archivos Afectados:**
  - `packages/database/scripts/seed-stress.ts`
  - `tests/load/k6-graph-query.js`
- **Criterios de Aceptación:**
  - [ ] El script `seed-stress.ts` corre en lotes transaccionales insertando en menos de 1 minuto en local.
  - [ ] El reporte k6 verifica que el endpoint GET `/api/v1/nodes/subgraph` con filtro responde en $p_{95} < 30\text{ms}$.

### HITO-4.5: Pipeline GitHub Actions CI/CD
- **Módulo / Componente:** `.github/workflows`
- **Descripción de la Tarea:** Consolidar el pipeline de verificación que ejecuta linting, tipado estricto, pruebas y reporte de cobertura al crear Pull Requests.
- **Archivos Afectados:**
  - `.github/workflows/ci.yml`
- **Criterios de Aceptación:**
  - [ ] El pipeline hace uso de `actions/cache` para acelerar `pnpm install`.
  - [ ] Usa Turborepo (`turbo run test:ci lint`) para correr procesos en paralelo.
  - [ ] Bloquea el merge si cualquier test falla o el typecheck estalla.