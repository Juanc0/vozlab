
# ESPECIFICACIÓN DE ARQUITECTURA DE APLICACIÓN Y STACK TÉCNICO (VOZLAB)

## 1. Visión Holística de la Infraestructura y Arquitectura

VozLab se compone de un sistema desacoplado pero cohesivo de tres capas: la PWA Cliente, la API de Negocio y Persistencia, y la Red de Procesamiento Asíncrono impulsada por Eventos e Inteligencia Artificial.


```

┌─────────────────────────────────────────────────────────────────────────────┐
│                           CAPA DE CLIENTE (PWA)                             │
│                  SvelteKit 5 (Svelte Runes) + Tailwind CSS                  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP / WebSockets / SSE
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API BACKEND PRINCIPAL                             │
│       Fastify (Node.js/TypeScript) + Zod + Drizzle ORM + postgres.js        │
│  (Arquitectura Hexagonal: Puertos, Adaptadores, Dominio y Casos de Uso)     │
└──────────────┬───────────────────────┬───────────────────────┬──────────────┘
               │                       │                       │
               │ Lectura/Escritura     │ Eventos Pub/Sub       │ Búsqueda/Cypher
               ▼                       ▼                       ▼
┌───────────────────────────┐ ┌───────────────────┐ ┌────────────────────────┐
│ PostgreSQL 16+            │ │ Redis Streams     │ │ Apache AGE + pgvector  │
│ (Relacional / Documental) │ │ (Event Broker)    │ │ (Grafo LPG & Embeddings│
└───────────────────────────┘ └────────┬──────────┘ └────────────────────────┘
                                       │
                                       │ Consumo de Eventos
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       WORKERS ASÍNCRONOS DE IA                              │
│             Python 3.12+ (Pydantic v2 + Ollama + LangChain)                 │
└─────────────────────────────────────────────────────────────────────────────┘

```

---

## 2. Stack Tecnológico del Backend

| Componente | Tecnología | Rol y Justificación |
| :--- | :--- | :--- |
| **Runtime & Lenguaje** | Node.js 20+ / TypeScript 5+ | Ejecución asíncrona de alto rendimiento I/O y tipado 100% estricto compartido con el cliente PWA. |
| **Framework Web** | **Fastify** | Framework web ultrarrápido con baja sobrecarga (*low overhead*), arquitectura basada en plugins y soporte nativo para esquemas JSON. |
| **Validación de Bordes** | **Zod** | Validación estricta en tiempo de ejecución de las entradas HTTP y parseo seguro de datos dinámicos. |
| **Acceso a Datos (ORM)** | **Drizzle ORM** | ORM liviano *zero-overhead* con tipado automático de esquemas, soporte para migraciones versionadas y escape directo a SQL raw para Cypher. |
| **Driver de PostgreSQL** | **`postgres.js`** | Driver de bajo nivel con parametrización nativa mediante *Tagged Template Literals* para prevenir Inyección SQL. |
| **Event Broker / PubSub** | **Redis Streams** | Mecanismo de mensajería ligera para publicar eventos (`NodeCreated`, `EditProposed`) hacia trabajadores en segundo plano. |

---

## 3. Arquitectura Interna del Backend (Hexagonal + Event-Driven)

### 3.1. Patrón Hexagonal (Puertos y Adaptadores)
El código dentro de la API se organiza en capas concéntricas aisladas:

* **Dominio (`src/domain`):** Entidades puras en TypeScript (`Node`, `Edge`, `EditProposal`, `OntologyClass`). No tienen dependencias de frameworks ni de la base de datos.
* **Casos de Uso (`src/application`):** Lógica de negocio (ej. `ApproveEditProposalUseCase`, `VoteEntityUseCase`). Coordinan las reglas sin conocer si los datos vienen de HTTP, CLI o WebSockets.
* **Puertos (`src/domain/ports`):** Interfaces TypeScript que definen los contratos para los repositorios y servicios externos (ej. `INodeRepository`, `IEventPublisher`).
* **Adaptadores (`src/infrastructure`):** Implementaciones concretas de los puertos:
  * Repositorios Drizzle/Postgres (`DrizzleNodeRepository.ts`).
  * Consultas de Grafo Cypher con Apache AGE (`AgeGraphRepository.ts`).
  * Publicador de eventos de Redis (`RedisEventPublisher.ts`).
  * Enrutadores de Fastify (`http/routes`).

### 3.2. Arquitectura Orientada a Eventos (Event-Driven vs Message-Driven)
* **Orientado a Eventos (Pub/Sub):** Cuando ocurre una acción mutativa en la API (ej. se crea un nodo), la API **solo emite el hecho pasado** a Redis Streams: `Event: NODE_CREATED { nodeId: "..." }`. La API responde al usuario inmediatamente en $\approx 5\text{ ms}$.
* **Desacoplamiento:** Los consumidores (Workers de Embeddings en Python, notificadores o limpiadores de caché) están suscritos a Redis Streams y reaccionan de forma independiente sin bloquear la API principal.

---

## 4. Stack Tecnológico del Frontend (PWA)

| Componente | Tecnología | Rol y Justificación |
| :--- | :--- | :--- |
| **Framework Base** | **SvelteKit 5 (Svelte 5)** | Compilador JS sin Virtual DOM. Reactividad basada en **Runes** (`$state()`, `$derived()`), entregando máxima ligereza y rendimiento en PWA móvil. |
| **Estilos & UI** | **Tailwind CSS + Bits UI / Shadcn-Svelte** | Sistema de diseño accesible, modular y personalizable mediante utility classes. |
| **Visualización de Grafos** | **Cytoscape.js / Vis.js** | Visualización interactiva de nodos, relaciones y trazados ontológicos en canvas/SVG. |
| **Gestión de Estado Servidor**| **SvelteKit Loaders & Form Actions** | Carga de datos progresiva y mutaciones mediante formularios HTML nativos con experiencia mejorada (Hydrated PWA). |

---

## 5. Estrategia de Persistencia y Acceso a Datos (Drizzle + Apache AGE)

El acceso a datos se divide explícitamente en el repositorio para optimizar rendimiento y mantener la seguridad:

### 5.1. Operaciones Relacionales y Documentales (Drizzle ORM)
Todas las operaciones relacionales directas (crear usuario, registrar votos en `public.interactions_log`, guardar mensajes en `social.discussion_posts` o consultar el metamodelo) se ejecutan mediante el API tipada de Drizzle:

```typescript
// Ejemplo de consulta tipada con Drizzle
export class DrizzleNodeRepository implements INodeRepository {
  async findById(id: string): Promise<Node null |> {
    const result = await db.query.nodes.findFirst({
      where: (nodes, { eq }) => eq(nodes.id, id),
    });
    return result ? mapToDomain(result) : null;
  }
}

```

### 5.2. Consultas de Grafo (Apache AGE Cypher via Raw SQL)

Las consultas que requieren navegar el grafo a 1, 2 o más saltos se ejecutan mediante bloques `sql` de Drizzle parametrizados de forma segura con `postgres.js`:

```typescript
// Ejemplo de consulta Cypher segura dentro del repositorio
export class AgeGraphRepository {
  async getNeighbours(nodeId: string) {
    return await db.execute(sql`
      SELECT * FROM ag_catalog.cypher('vozlab_graph', $$
        MATCH (a:Node {id: ${nodeId}})-[r:EDGE]->(b:Node)
        RETURN a.title AS origen, type(r) AS relacion, b.title AS destino
      $$) AS (origen agtype, relacion agtype, destino agtype);
    `);
  }
}

```
