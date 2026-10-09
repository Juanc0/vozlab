
# REGISTRO DE DECISIONES DE ARQUITECTURA Y DISEÑO TÉCNICO (VOZLAB)

## 1. Visión General del Proyecto y Filosofía de Diseño

**VozLab** es una plataforma institucional de inteligencia colectiva y resolución colaborativa de problemas. El sistema combina **Grafos de Conocimiento (Knowledge Graphs)**, **Metamodelado Dinámico**, **Gobernanza Colaborativa de Autor (tipo Pull Request)** y un **Pipeline de IA Asíncrono**.

### Principios Fundamentales de Arquitectura:
1. **Prioridad en la Integridad y Modularidad:** Se prioriza la robustez ontológica, la trazabilidad e interoperabilidad a largo plazo sobre la velocidad inmediata de desarrollo.
2. **Gobernanza de Mantenedor / Autor:** Toda entidad creada (Nodos, Aristas, Clases/Atributos Ontológicos) cuenta con un `author_hash` que actúa como "Maintainer" o dueño de la iniciativa con la potestad final para aprobar/rechazar propuestas de edición.
3. **Desacoplamiento Estructural:** Desacoplamiento estricto entre el dominio de datos (`public`), el metamodelo ontológico (`meta`) y la capa de interacción social (`social`).

---

## 2. Stack Tecnológico Seleccionado y Justificación


```

┌─────────────────────────────────────────────────────────────────────────────┐
│                             POSTGRESQL 16+                                  │
│                       (Motor de Base de Datos Único)                        │
├───────────────────────┬─────────────────────────────┬───────────────────────┤
│    `pgvector`         │       `Apache AGE`          │       `JSONB`         │
│ (Búsqueda Vectorial / │ (Grafo LPG Cypher Nativo /  │  (Document Store /    │
│ Embeddings de IA)     │ Interoperabilidad SQL)      │  Atributos Dinámicos) │
└───────────────────────┴─────────────────────────────┴───────────────────────┘

```

| Componente / Tecnología | Opción Seleccionada | Opciones Evaluadas | Justificación Técnica |
| :--- | :--- | :--- | :--- |
| **Base de Datos Principal** | **PostgreSQL 16+** | Neo4j + Postgres, MongoDB, MySQL | Unifica en una sola infraestructura almacenamiento relacional, documental, de grafos y vectorial con transacciones ACID e integridad referencial nativa. |
| **Motor de Grafo** | **Apache AGE** *(sobre Postgres)* | Neo4j (Standalone), SQL Puro con CTEs | Permite ejecutar consultas Cypher nativas (`MATCH (n)-[r]->(m)`) e interoperar con SQL y `pgvector` en el mismo motor sin pagar infraestructuras duales ni licenciamientos Enterprise. |
| **Búsqueda Semántica / IA** | **`pgvector`** (HNSW Indexing) | Qdrant, Pinecone, ChromaDB | Ofrece rendimiento vectorial de nivel industrial para 768 dimensiones (Ollama/Embeddings) dentro de la misma base de datos, evitando desincronizaciones de estado. |
| **Capa Social y Hilos** | **PostgreSQL Normalizado (`social.*`)** | MongoDB, DocumentStore JSONB único | El modelo relacional normalizado con un mensaje raíz por hilo permite votación granular (`upvotes/downvotes`) por comentario individual, moderación limpia y paginación rápida (*lazy loading*). |
| **Cuerpo de Mensajes** | **Columna `TEXT` (UTF-8)** | `JSONB` para contenido | Ocupa menos espacio, soporta compresión automática TOAST en Postgres, Búsqueda Full-Text nativa y soporta de forma ilimitada Markdown, URLs y emojis UTF-8. |

---

## 3. Decisiones de Diseño del Metamodelo y Ontología

### 3.1. Inspiración en RDF/OWL y Anytype pero con Labeled Property Graph (LPG)
* **Separación de Propiedades:** Se diferencian explícitamente las **Propiedades de Datos (`datatype_properties`)** (atributos directos como texto, números, fechas) de las **Propiedades de Objeto (`object_properties`)** (relaciones dirigidas entre nodos) para garantizar tipado fuerte en backend, índices B-Tree/GIN óptimos y validación de claves foráneas.
* **Restricciones y Axiomas (`ontology_restrictions`):** Permite definir rangos, dominios y cardinalidades válidas (Dominio/Rango estilo OWL) para evitar que la comunidad o la IA generen conexiones absurdas.

### 3.2. Carga en Caché y Desempeño Cero-Latencia
* **Ontología Activa en RAM/Redis:** La API y los Agentes de IA no consultan las tablas `meta` en cada petición. El sistema mantiene una compilación compacta en JSON con los elementos en estado `ACTIVE`.
* **Actualización Incremental (Delta/PubSub):** Cuando una propuesta ontológica se aprueba, la caché se actualiza mediante eventos puntuales (`HSET` / `HDEL`), evitando reescrituras pesadas de historial.

---

## 4. Gobernanza Colaborativa y Flujo estilo Pull Request (PR)

### 4.1. Propuestas Polimórficas de Edición (`public.edit_proposals`)
Toda sugerencia de cambio (corrección de ortografía, reestructuración o adición de atributos) sobre un Nodo, Arista o Elemento Ontológico genera un objeto de propuesta polimórfico:
1. **Transparencia Social:** La propuesta de edición se enlaza a un hilo en `social.discussion_threads` donde la comunidad puede opinar y dar votos informativos de respaldo (`upvotes/downvotes`).
2. **Decisión del Mantenedor:** El autor/creador original (`author_hash`) recibe una notificación y cuenta con el botón exclusivo para **Aprobar/Fusionar (`APPROVED_BY_AUTHOR`)** o **Rechazar (`REJECTED_BY_AUTHOR`)**.
3. **Desbloqueo por Inactividad:** Si una propuesta tiene alto respaldo comunitario (`community_score >= +10`) y el autor está inactivo por más de 14 días, un Moderador/Comité puede aplicar una aprobación supervisada (`AUTO_APPLIED`).

---

## 5. Mapeo de Tablas y Estructura SQL Definitiva


```

┌─────────────────────────────────────────────────────────┐
│                      meta.*                             │
│  (ontology_classes, datatype_properties,                │
│   object_properties, ontology_restrictions)             │
└────────────────────────────┬────────────────────────────┘
│ Compila Caché RAM
▼
┌─────────────────────────────────────────────────────────┐
│                     public.*                            │
│  (nodes, edges, edit_proposals, interactions_log)       │
└────────────────────────────┬────────────────────────────┘
│ Enlace target_id
▼
┌─────────────────────────────────────────────────────────┐
│                     social.*                            │
│  (discussion_threads, discussion_posts)                 │
└─────────────────────────────────────────────────────────┘

```

### Script de Inicialización Integrado

```sql
-- 1. Extensiones y Grafo en Apache AGE
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "age";

SET search_path = ag_catalog, "$user", public;
SELECT ag_catalog.create_graph('vozlab_graph');

CREATE SCHEMA IF NOT EXISTS meta;
CREATE SCHEMA IF NOT EXISTS social;

-- 2. Metamodelo Ontológico
CREATE TABLE meta.ontology_classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_key VARCHAR(100) UNIQUE NOT NULL,
    display_names JSONB NOT NULL,
    descriptions JSONB DEFAULT '{}'::jsonb,
    parent_class_key VARCHAR(100) REFERENCES meta.ontology_classes(system_key),
    status VARCHAR(20) DEFAULT 'PROPOSED',
    approval_score INT DEFAULT 0,
    proposed_by VARCHAR(64) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE meta.datatype_properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_key VARCHAR(100) UNIQUE NOT NULL,
    display_names JSONB NOT NULL,
    descriptions JSONB DEFAULT '{}'::jsonb,
    data_type VARCHAR(30) NOT NULL,
    enum_values JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(20) DEFAULT 'PROPOSED',
    approval_score INT DEFAULT 0,
    proposed_by VARCHAR(64) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE meta.object_properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_key VARCHAR(100) UNIQUE NOT NULL,
    display_names JSONB NOT NULL,
    descriptions JSONB DEFAULT '{}'::jsonb,
    is_directional BOOLEAN DEFAULT TRUE,
    status VARCHAR(20) DEFAULT 'PROPOSED',
    approval_score INT DEFAULT 0,
    proposed_by VARCHAR(64) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE meta.ontology_restrictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_class_key VARCHAR(100) NOT NULL REFERENCES meta.ontology_classes(system_key),
    datatype_property_key VARCHAR(100) REFERENCES meta.datatype_properties(system_key),
    is_required BOOLEAN DEFAULT FALSE,
    object_property_key VARCHAR(100) REFERENCES meta.object_properties(system_key),
    range_class_key VARCHAR(100) REFERENCES meta.ontology_classes(system_key),
    validation_rules JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) DEFAULT 'PROPOSED',
    approval_score INT DEFAULT 0,
    proposed_by VARCHAR(64) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Dominio de Datos del Grafo (public.*)
CREATE TABLE public.nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type_key VARCHAR(100) NOT NULL REFERENCES meta.ontology_classes(system_key),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    attributes JSONB DEFAULT '{}'::jsonb,
    embedding vector(768),
    author_hash VARCHAR(64) NOT NULL,
    evidence_count INT DEFAULT 1,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    merged_into_node_id UUID REFERENCES public.nodes(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_nodes_type ON public.nodes(type_key);
CREATE INDEX idx_nodes_jsonb ON public.nodes USING gin (attributes);
CREATE INDEX idx_nodes_embedding ON public.nodes USING hnsw (embedding vector_cosine_ops);

CREATE TABLE public.edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_node_id UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    target_node_id UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    relation_key VARCHAR(100) NOT NULL REFERENCES meta.object_properties(system_key),
    attributes JSONB DEFAULT '{}'::jsonb,
    upvotes INT DEFAULT 0,
    downvotes INT DEFAULT 0,
    community_score INT GENERATED ALWAYS AS (upvotes - downvotes) STORED,
    created_by VARCHAR(64) NOT NULL,
    status VARCHAR(20) DEFAULT 'PROPOSED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_edge UNIQUE (source_node_id, target_node_id, relation_key)
);

CREATE TABLE public.edit_proposals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_id UUID NOT NULL,
    target_type VARCHAR(30) NOT NULL,
    thread_id UUID,
    proposer_hash VARCHAR(64) NOT NULL,
    proposed_changes JSONB NOT NULL,
    justification TEXT,
    upvotes INT DEFAULT 0,
    downvotes INT DEFAULT 0,
    community_score INT GENERATED ALWAYS AS (upvotes - downvotes) STORED,
    status VARCHAR(30) DEFAULT 'PENDING',
    resolved_by VARCHAR(64),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.interactions_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_hash VARCHAR(64) NOT NULL,
    target_id UUID NOT NULL,
    target_type VARCHAR(30) NOT NULL,
    action_type VARCHAR(30) NOT NULL,
    vote_value INT NOT NULL CHECK (vote_value IN (-1, 1)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_target_vote UNIQUE (user_hash, target_id, target_type)
);

-- 4. Capa Social Normalizada (social.*)
CREATE TABLE social.discussion_threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_id UUID NOT NULL,
    target_type VARCHAR(30) NOT NULL,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'OPEN',
    created_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE social.discussion_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id UUID NOT NULL REFERENCES social.discussion_threads(id) ON DELETE CASCADE,
    parent_post_id UUID REFERENCES social.discussion_posts(id) ON DELETE CASCADE,
    author_hash VARCHAR(64) NOT NULL,
    content TEXT NOT NULL,
    attributes JSONB DEFAULT '{}'::jsonb,
    upvotes INT DEFAULT 0,
    downvotes INT DEFAULT 0,
    community_score INT GENERATED ALWAYS AS (upvotes - downvotes) STORED,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

```



---

## 6. Decisiones de Arquitectura de Aplicación y Stack Tecnológico

### 6.1. Selección del Backend: TypeScript + Fastify + Drizzle ORM
* **Justificación frente a Python/Rust:** TypeScript permite compartir tipos e interfaces de datos directamente con la PWA SvelteKit. Fastify provee un tiempo de respuesta de escasos milisegundos para operaciones E/S asíncronas.
* **Justificación de Drizzle ORM + postgres.js:**
  * Drizzle provee una capa de abstracción *zero-overhead* con tipado estricto en compilación y control de migraciones versionadas.
  * Combina la seguridad contra Inyección SQL mediante parametrización nativa en `postgres.js` con el escape directo a sentencias SQL/Cypher para **Apache AGE**.

### 6.2. Selección del Frontend: SvelteKit 5 (Svelte Runes)
* **Justificación frente a React/Vue:** SvelteKit 5 compila el código a JavaScript vanila ultra optimizado sin sobrecarga de Virtual DOM. Las primitivas de reactividad de Svelte 5 (`$state()`) permiten que mutaciones granulares (como upvotes en hilos de discusión) actualicen de forma atómica el DOM sin re-renderizar componentes padres, maximizando la fluidez y la vida de batería en la PWA móvil.

### 6.3. Desacoplamiento Event-Driven via Redis Streams
* **Notificaciones Pasadas (Events):** La API de Fastify se limita a registrar las transacciones en PostgreSQL y emitir un evento pasado a Redis Streams (`NODE_CREATED`, `EDIT_PROPOSED`).
* **Trabajadores en Segundo Plano:** Los servicios pesados (generación de embeddings vectoriales con Ollama y agentes de IA en Python) consumen la cola de Redis de forma asíncrona, evitando bloquear la latencia de respuesta al usuario final ($\approx 5\text{ ms}$).

```

---