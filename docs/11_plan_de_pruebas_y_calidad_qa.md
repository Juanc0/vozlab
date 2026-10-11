
# ESPECIFICACIÓN DE PLAN DE PRUEBAS, CALIDAD Y STRATEGY DE QA (VOZLAB)

## 1. Pirámide de Pruebas y Cobertura de Calidad

VozLab adopta un enfoque de **Aseguramiento de Calidad en Pirámide** para maximizar la velocidad de ejecución en CI/CD y garantizar la estabilidad del sistema sin sobrecargar los costos de mantenimiento de pruebas:


```

┌─────────────────────────────────────────────────────────────────────────────┐
│                            PIRÁMIDE DE TESTING                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                         [ E2E Tests: Playwright ]                           │
│                      PWA + Fastify + DB (Flujos Críticos)                   │
│                       ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~                       │
│                   [ Integration Tests: Vitest + Docker ]                    │
│                 Fastify HTTP Routes + Drizzle SQL + AGE Cypher               │
│                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~                  │
│                [ Unit Tests: Vitest + In-Memory Mocks ]                     │
│               Dominio, Reglas de Negocio, Casos de Uso, Zod                 │
└─────────────────────────────────────────────────────────────────────────────┘

```

---

## 2. Niveles de Prueba y Herramientas

### 2.1. Pruebas Unitarias (Unit Tests)
* **Herramienta:** **Vitest** (mismo compilador/parser que Vite/SvelteKit, ejecución ultra rápida).
* **Alcance:**
  * Entidades del Dominio y Value Objects (`AuthorHash`, `VoteValue`, `Node`).
  * Validación de esquemas Zod en entradas HTTP.
  * Casos de Uso acoplados a **Repositorios en Memoria (`In-Memory Repositories`)**.
* **Métricas Objetivo:** Cobertura de código $> 85\%$ en capas `domain/` y `application/`.

### 2.2. Pruebas de Integración (Integration Tests)
* **Herramienta:** **Vitest** con un contenedor efímero de **PostgreSQL 16+ (Apache AGE + pgvector)** vía Docker.
* **Alcance:**
  * Verificación de consultas Drizzle ORM sobre esquemas `auth`, `meta`, `public` y `social`.
  * Verificación de navegaciones en el grafo Cypher sobre Apache AGE (`getNeighbours`, saltos de aristas).
  * Comprobación de transacciones atómicas multitabla (`UnitOfWork`).
  * Verificación de publicación y consumo de eventos en **Redis Streams**.

### 2.3. Pruebas End-to-End (E2E Tests)
* **Herramienta:** **Playwright**.
* **Alcance:** Validación automatizada sobre la PWA cliente compilada en SvelteKit 5:
  1. Flujo de inicio de sesión simulado OIDC/Event QR.
  2. Selección y cambio de Workspace desde el selector lateral.
  3. Creación de un nuevo Nodo en el grafo y verificación de renderizado en Cytoscape.js.
  4. Creación y aprobación/rechazo de una Propuesta de Edición (*Pull Request* de contenido).

---

## 3. Pruebas de Estrés y Benchmarking de Grafos

Dado que VozLab gestiona grafos de conocimiento y búsquedas vectoriales híbridas (`pgvector` + Cypher), la suite de QA incluye un script de prueba de carga con **k6**:

### 3.1. Criterios de Rendimiento Objetivo (SLA)
* **Consultas de Grafo (Subgrafo <200 nodos):** Tiempo de respuesta $p_{95} < 30\text{ ms}$.
* **Búsqueda Semántica Vectorial (HNSW 768 dims):** Tiempo de respuesta $p_{95} < 20\text{ ms}$.
* **Mutaciones y Registros de Votos:** Tiempo de respuesta $p_{95} < 15\text{ ms}$.

### 3.2. Generación de Datos Sintéticos (Seeding de Estrés)
El comando `npm run db:seed:stress` genera un subgrafo denso de **10,000 Nodos y 50,000 Aristas** en PostgreSQL/AGE para verificar que los índices B-Tree, GIN y HNSW mantengan la latencia constante bajo carga.

---

## 4. Automatización en el Pipeline de CI/CD

Las pruebas se ejecutan en tres puertas de calidad (*Quality Gates*) secuenciales:


```

┌─────────────────────────────────────────────────────────────────────────────┐
│                        QUALITY GATES EN GITHUB ACTIONS                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ Gate 1 (Pull Request): Lint Check + Type Check + Unit Tests (0-15s)          │
│ Gate 2 (Merge a Main): Integration Tests con Postgres/AGE en Docker (1-2m)   │
│ Gate 3 (Pre-Release):  E2E Playwright Tests + k6 Performance Benchmark (3-5m) │
└─────────────────────────────────────────────────────────────────────────────┘

```
