# ESPECIFICACIÓN TÉCNICA: MODELO DE DATOS Y METAMODELO (VOZLAB)

## 1. Arquitectura de Grafo, Metamodelo y Gobernanza de Autor

VozLab se basa en un **Grafo de Propiedades Etiquetado (Labeled Property Graph - LPG)** implementado en **PostgreSQL 16+**. 

* **Nodos (`public.nodes`):** Entidades dinámicas (Problemas, Causa, Solución, Recurso).
* **Aristas / Bordes (`public.edges`):** Relaciones de primer orden con contadores comunitarios independientes.
* **Metamodelo (`meta.*`):** Gobernanza de la ontología y reglas del sistema.
* **Discusiones (`social.*`):** Hilos colaborativos vinculados a propuestas o contenidos.
* **Propuestas de Edición (`public.edit_proposals`):** Sistema unificado estilo "Pull Request" donde la comunidad propone cambios sobre nodos, aristas o elementos ontológicos, y el **autor/creador original** aprueba o rechaza la fusión.

---

## 2. Esquema de Ontología y Metamodelo (`schema: meta`)

```sql
CREATE SCHEMA IF NOT EXISTS meta;

-- 2.1. Clases / Tipos de Nodos
CREATE TABLE meta.ontology_classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_key VARCHAR(100) UNIQUE NOT NULL, -- Ej: 'problema_infraestructura'
    display_names JSONB NOT NULL,            -- Ej: {"es": "Problema de Infraestructura"}
    descriptions JSONB DEFAULT '{}'::jsonb,
    parent_class_key VARCHAR(100) REFERENCES meta.ontology_classes(system_key),
    
    status VARCHAR(20) DEFAULT 'PROPOSED',   -- 'PROPOSED', 'ACTIVE', 'DEPRECATED'
    approval_score INT DEFAULT 0,
    proposed_by VARCHAR(64) NOT NULL,        -- Autor de la propuesta ontológica (Maintainer)
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2.2. Propiedades de Datos (Datatype Properties)
CREATE TABLE meta.datatype_properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_key VARCHAR(100) UNIQUE NOT NULL, -- Ej: 'presupuesto_estimado'
    display_names JSONB NOT NULL,
    descriptions JSONB DEFAULT '{}'::jsonb,
    
    data_type VARCHAR(30) NOT NULL,          -- 'STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'ENUM'
    enum_values JSONB DEFAULT '[]'::jsonb,
    
    status VARCHAR(20) DEFAULT 'PROPOSED',
    approval_score INT DEFAULT 0,
    proposed_by VARCHAR(64) NOT NULL,        -- Autor de la propuesta ontológica (Maintainer)
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2.3. Propiedades de Objeto / Tipos de Aristas (Object Properties)
CREATE TABLE meta.object_properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_key VARCHAR(100) UNIQUE NOT NULL, -- Ej: 'resuelve', 'causa_de'
    display_names JSONB NOT NULL,
    descriptions JSONB DEFAULT '{}'::jsonb,
    is_directional BOOLEAN DEFAULT TRUE,
    
    status VARCHAR(20) DEFAULT 'PROPOSED',
    approval_score INT DEFAULT 0,
    proposed_by VARCHAR(64) NOT NULL,        -- Autor de la propuesta ontológica (Maintainer)
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
    proposed_by VARCHAR(64) NOT NULL,        -- Autor de la propuesta ontológica (Maintainer)
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

```

---

## 3. Esquema de Datos del Grafo (`schema: public`)

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 3.1. Nodos
CREATE TABLE public.nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type_key VARCHAR(100) NOT NULL REFERENCES meta.ontology_classes(system_key),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    attributes JSONB DEFAULT '{}'::jsonb,
    embedding vector(768),
    
    author_hash VARCHAR(64) NOT NULL,        -- Autor / Maintainer del Nodo
    evidence_count INT DEFAULT 1,
    status VARCHAR(20) DEFAULT 'ACTIVE',    -- 'ACTIVE', 'MERGED_INTO', 'ARCHIVED'
    merged_into_node_id UUID REFERENCES public.nodes(id),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_nodes_type ON public.nodes(type_key);
CREATE INDEX idx_nodes_jsonb ON public.nodes USING gin (attributes);
CREATE INDEX idx_nodes_embedding ON public.nodes USING hnsw (embedding vector_cosine_ops);

-- 3.2. Aristas / Bordes (Relaciones)
CREATE TABLE public.edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_node_id UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    target_node_id UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    relation_key VARCHAR(100) NOT NULL REFERENCES meta.object_properties(system_key),
    
    attributes JSONB DEFAULT '{}'::jsonb,
    
    upvotes INT DEFAULT 0,
    downvotes INT DEFAULT 0,
    community_score INT GENERATED ALWAYS AS (upvotes - downvotes) STORED,
    
    created_by VARCHAR(64) NOT NULL,        -- Autor / Maintainer de la Arista
    status VARCHAR(20) DEFAULT 'PROPOSED',  -- 'PROPOSED', 'APPROVED', 'REJECTED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_edge UNIQUE (source_node_id, target_node_id, relation_key)
);

CREATE INDEX idx_edges_source ON public.edges(source_node_id);
CREATE INDEX idx_edges_target ON public.edges(target_node_id);

-- 3.3. Propuestas Polimórficas de Edición (Gobernanza del Autor / PRs)
CREATE TABLE public.edit_proposals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_id UUID NOT NULL,                -- ID del elemento a editar (node, edge o meta)
    target_type VARCHAR(30) NOT NULL,       -- 'NODE', 'EDGE', 'ONTOLOGY_CLASS', 'DATATYPE_PROPERTY', 'OBJECT_PROPERTY'
    thread_id UUID,                         -- ID del hilo de discusión asociado en social.discussion_threads
    
    proposer_hash VARCHAR(64) NOT NULL,     -- Usuario B (Quien propone la edición)
    proposed_changes JSONB NOT NULL,        -- Diff de cambios {"title": "Nuevo título", "display_names": {...}}
    justification TEXT,                     -- Motivo / Explicación del cambio
    
    -- Votación de la comunidad (Señal informativa de respaldo para el autor)
    upvotes INT DEFAULT 0,
    downvotes INT DEFAULT 0,
    community_score INT GENERATED ALWAYS AS (upvotes - downvotes) STORED,
    
    -- Estado de Aprobación por el Autor / Maintainer
    status VARCHAR(30) DEFAULT 'PENDING',   -- 'PENDING', 'APPROVED_BY_AUTHOR', 'REJECTED_BY_AUTHOR', 'AUTO_APPLIED'
    resolved_by VARCHAR(64),                -- Hash del autor que tomó la decisión
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_edit_proposals_target ON public.edit_proposals(target_id, target_type);

-- 3.4. Log de Auditoría e Interacciones
CREATE TABLE public.interactions_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_hash VARCHAR(64) NOT NULL,
    target_id UUID NOT NULL,                -- Puede ser node_id, edge_id, proposal_id, post_id
    target_type VARCHAR(30) NOT NULL,       -- 'NODE', 'EDGE', 'EDIT_PROPOSAL', 'DISCUSSION_POST'
    action_type VARCHAR(30) NOT NULL,       -- 'UPVOTE', 'DOWNVOTE'
    vote_value INT NOT NULL CHECK (vote_value IN (-1, 1)),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_target_vote UNIQUE (user_hash, target_id, target_type)
);

```

---

## 4. Esquema para Hilos de Discusión Social (`schema: social`)

Soporta el debate comunitario sobre cualquier elemento o propuesta de edición:

```sql
CREATE SCHEMA IF NOT EXISTS social;

-- 4.1. Hilos de Discusión (Vinculados a Nodos, Aristas, Metaontología o Propuestas de Edición)
CREATE TABLE social.discussion_threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_id UUID NOT NULL,             -- ID del objetivo (node, edge, meta_proposal, edit_proposal)
    target_type VARCHAR(30) NOT NULL,    -- 'NODE', 'EDGE', 'ONTOLOGY_CLASS', 'EDIT_PROPOSAL'
    title VARCHAR(255) NOT NULL,
    
    status VARCHAR(20) DEFAULT 'OPEN',   -- 'OPEN', 'RESOLVED', 'CLOSED'
    created_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4.2. Aportes / Mensajes del Hilo
CREATE TABLE social.discussion_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id UUID NOT NULL REFERENCES social.discussion_threads(id) ON DELETE CASCADE,
    parent_post_id UUID REFERENCES social.discussion_posts(id), -- Respuestas anidadas
    
    author_hash VARCHAR(64) NOT NULL,
    content TEXT NOT NULL,
    
    upvotes INT DEFAULT 0,
    downvotes INT DEFAULT 0,
    community_score INT GENERATED ALWAYS AS (upvotes - downvotes) STORED,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

```
