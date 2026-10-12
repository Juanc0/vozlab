# Panel de Tareas Activas (VozLab)

## FASE 0: BOILERPLATE E INFRAESTRUCTURA BASE DEL MONOREPO
- [x] HITO-0.1: Inicialización del Monorepo y Herramientas Base (pnpm, turbo, ts-config)
- [ ] HITO-0.2: Orquestación de Contenedores Locales (Docker Compose con Postgres+AGE+pgvector, Redis, Ollama)
- [ ] HITO-0.3: Definición de Shared Types, Zod Schemas y Errores Estructurados (`packages/shared-types`)
- [ ] HITO-0.4: Persistencia Drizzle ORM - Esquemas Router y Tenant (`packages/database`)

## FASE 1: CORE BACKEND FASTIFY API (`apps/api`)
- [ ] HITO-1.1: Scaffolding API y Logger Estructurado con `reqId`
- [ ] HITO-1.2: Capa de Dominio (Hexagonal Core)
- [ ] HITO-1.3: Adaptadores de Persistencia y Multi-Tenant Pool Manager
- [ ] HITO-1.4: Middlewares de Identidad y Aislamiento (Zero-Trust)
- [ ] HITO-1.5: Casos de Uso y Controladores REST (Gobernanza)

## FASE 2: WORKERS DE IA EN PYTHON
- [ ] HITO-2.1 a HITO-2.6 (Extractor y Relacionador)

## FASE 3: FRONTEND PWA SVELTEKIT 5 (`apps/web`)
- [ ] HITO-3.1 a HITO-3.5
ds
## FASE 4: CI/CD, OBSERVABILIDAD Y QA AUTOMATIZADO
- [ ] HITO-4.1 a HITO-4.5