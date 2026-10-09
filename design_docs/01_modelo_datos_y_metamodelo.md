# ESPECIFICACIÓN TÉCNICA: MODELO DE DATOS Y METAMODELO (VOZLAB)

## 1. Arquitectura de Grafo, Metamodelo y Gobernanza de Autor

VozLab se basa en un **Grafo de Propiedades Etiquetado (Labeled Property Graph - LPG)** implementado en **PostgreSQL 16+**. 

* **Nodos (`public.nodes`):** Entidades dinámicas (Problemas, Causa, Solución, Recurso).
* **Aristas / Bordes (`public.edges`):** Relaciones de primer orden con contadores comunitarios independientes.
* **Metamodelo (`meta.*`):** Gobernanza de la ontología y reglas del sistema.
* **Discusiones (`social.*`):** Hilos colaborativos vinculados a propuestas o contenidos.
* **Propuestas de Edición (`public.edit_proposals`):** Sistema unificado estilo "Pull Request" donde la comunidad propone cambios sobre nodos, aristas o elementos ontológicos, y el **autor/creador original** aprueba o rechaza la fusión.

---

## 2. CONFIGURACIÓN DE EXTENSIONES Y GRAFO EN APACHE AGE

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "age";

-- Cargar Apache AGE en el path de ejecución
SET search_path = ag_catalog, "$user", public;

-- Inicializar el Grafo Principal de VozLab en Apache AGE
SELECT ag_catalog.create_graph('vozlab_graph');

CREATE SCHEMA IF NOT EXISTS meta;
CREATE SCHEMA IF NOT EXISTS social;
```

---

## 3. Esquema de Ontología y Metamodelo (`schema: meta`)

```sql
-- 2.1. Clases / Tipos de Nodos
CREATE TABLE meta.ontology_classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_key VARCHAR(100) UNIQUE NOT NULL,
    display_names JSONB NOT NULL,
    descriptions JSONB DEFAULT '{}'::jsonb,
    parent_class_key VARCHAR(100) REFERENCES meta.ontology_classes(system_key),
    
    status VARCHAR(20) DEFAULT 'PROPOSED',   -- 'PROPOSED', 'ACTIVE', 'DEPRECATED'
    approval_score INT DEFAULT 0,
    proposed_by VARCHAR(64) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2.2. Propiedades de Datos (Datatype Properties)
CREATE TABLE meta.datatype_properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_key VARCHAR(100) UNIQUE NOT NULL,
    display_names JSONB NOT NULL,
    descriptions JSONB DEFAULT '{}'::jsonb,
    
    data_type VARCHAR(30) NOT NULL,          -- 'STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'ENUM'
    enum_values JSONB DEFAULT '[]'::jsonb,
    
    status VARCHAR(20) DEFAULT 'PROPOSED',
    approval_score INT DEFAULT 0,
    proposed_by VARCHAR(64) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2.3. Propiedades de Objeto / Tipos de Aristas (Object Properties)
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

-- 2.4. Restricciones Ontológicas (OWL Restrictions)
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

```

---

## 3. ESQUEMA DE DATOS Y BÚSQUEDA VECTORIAL (`schema: public`)

```sql
-- 3.1. Nodos Relacionales + Soporte Vectorial pgvector
CREATE TABLE public.nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type_key VARCHAR(100) NOT NULL REFERENCES meta.ontology_classes(system_key),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    attributes JSONB DEFAULT '{}'::jsonb,
    embedding vector(768),                   -- HNSW Vectorial para Ollama/Embeddings
    
    author_hash VARCHAR(64) NOT NULL,
    evidence_count INT DEFAULT 1,
    status VARCHAR(20) DEFAULT 'ACTIVE',    -- 'ACTIVE', 'MERGED_INTO', 'ARCHIVED'
    merged_into_node_id UUID REFERENCES public.nodes(id),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_nodes_type ON public.nodes(type_key);
CREATE INDEX idx_nodes_jsonb ON public.nodes USING gin (attributes);
CREATE INDEX idx_nodes_embedding ON public.nodes USING hnsw (embedding vector_cosine_ops);

-- 3.2. Aristas Relacionales (Tabla Espejo para Integridad / Votos Fast-Read)
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

CREATE INDEX idx_edges_source ON public.edges(source_node_id);
CREATE INDEX idx_edges_target ON public.edges(target_node_id);

-- 3.3. Propuestas Polimórficas de Edición (Pull Requests)
CREATE TABLE public.edit_proposals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_id UUID NOT NULL,
    target_type VARCHAR(30) NOT NULL,       -- 'NODE', 'EDGE', 'ONTOLOGY_CLASS', etc.
    thread_id UUID,
    
    proposer_hash VARCHAR(64) NOT NULL,
    proposed_changes JSONB NOT NULL,
    justification TEXT,
    
    upvotes INT DEFAULT 0,
    downvotes INT DEFAULT 0,
    community_score INT GENERATED ALWAYS AS (upvotes - downvotes) STORED,
    
    status VARCHAR(30) DEFAULT 'PENDING',   -- 'PENDING', 'APPROVED_BY_AUTHOR', 'REJECTED_BY_AUTHOR'
    resolved_by VARCHAR(64),
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_edit_proposals_target ON public.edit_proposals(target_id, target_type);

-- 3.4. Log de Auditoría e Interacciones
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

```

---

## 4. Esquema para Hilos de Discusión Social (`schema: social`)

Soporta el debate comunitario sobre cualquier elemento o propuesta de edición:

```sql
-- Hilo de Discusión (Encabezado/Contenedor)
CREATE TABLE social.discussion_threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_id UUID NOT NULL,             -- ID de la entidad relacionada (node, edge, edit_proposal)
    target_type VARCHAR(30) NOT NULL,    -- 'NODE', 'EDGE', 'ONTOLOGY_CLASS', 'EDIT_PROPOSAL'
    title VARCHAR(255) NOT NULL,
    
    status VARCHAR(20) DEFAULT 'OPEN',   -- 'OPEN', 'RESOLVED', 'CLOSED'
    created_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Todos los comentarios (incluido el mensaje raíz)
CREATE TABLE social.discussion_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id UUID NOT NULL REFERENCES social.discussion_threads(id) ON DELETE CASCADE,
    parent_post_id UUID REFERENCES social.discussion_posts(id) ON DELETE CASCADE, -- NULL = Mensaje Raíz del Hilo
    
    author_hash VARCHAR(64) NOT NULL,
    content TEXT NOT NULL,               -- Soporta Markdown, emojis UTF-8, enlaces y texto extenso
    attributes JSONB DEFAULT '{}'::jsonb, -- Adjuntos, menciones, metadatos extra
    
    upvotes INT DEFAULT 0,
    downvotes INT DEFAULT 0,
    community_score INT GENERATED ALWAYS AS (upvotes - downvotes) STORED,
    
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```
