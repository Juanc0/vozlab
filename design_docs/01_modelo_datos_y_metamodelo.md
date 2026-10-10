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

-- =============================================================================
-- ESQUEMA COMPLETO Y REFINADO DE VOZLAB (PostgreSQL 16+ / Apache AGE / pgvector)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "age";

SET search_path = ag_catalog, "$user", public;
SELECT ag_catalog.create_graph('vozlab_graph');

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS meta;
CREATE SCHEMA IF NOT EXISTS social;

-- =============================================================================
-- 1. CAPA DE IDENTIDAD Y ESPACIOS DE TRABAJO (schema: auth)
-- =============================================================================

CREATE TABLE auth.workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(100) UNIQUE NOT NULL,      -- Ej: 'ingenieria', 'sandbox-demo'
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE auth.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE,              -- NULL para usuarios anónimos de eventos
    full_name VARCHAR(255),
    avatar_url TEXT,
    
    provider VARCHAR(30) NOT NULL,          -- 'OIDC_INSTITUTIONAL', 'GOOGLE_OAUTH', 'ANONYMOUS_EVENT'
    provider_user_id VARCHAR(255),
    
    author_hash VARCHAR(64) UNIQUE NOT NULL, -- Seudónimo / Hash público para el Grafo
    anonymous_alias VARCHAR(100),           -- Ej: 'Nave-Explorer-84'
    device_fingerprint_hash VARCHAR(64),    -- Token para reconexión de anónimos
    
    status VARCHAR(30) DEFAULT 'ACTIVE',    -- 'ACTIVE', 'PENDING_APPROVAL', 'SUSPENDED'
    system_role VARCHAR(30) DEFAULT 'USER', -- 'USER', 'SUPER_ADMIN'
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_author_hash ON auth.users(author_hash);

CREATE TABLE auth.workspace_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES auth.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(30) NOT NULL DEFAULT 'MEMBER', -- 'MEMBER', 'WORKSPACE_ADMIN'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_workspace UNIQUE (workspace_id, user_id)
);

CREATE TABLE auth.event_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES auth.workspaces(id) ON DELETE CASCADE,
    event_code VARCHAR(30) UNIQUE NOT NULL, -- Ej: 'SABANA2026'
    title VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 2. METAMODELO Y ONTOLOGÍA SEGMENTADA POR WORKSPACE (schema: meta)
-- =============================================================================

CREATE TABLE meta.ontology_classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES auth.workspaces(id) ON DELETE CASCADE, -- NULL = Ontología Base
    system_key VARCHAR(100) NOT NULL,
    display_names JSONB NOT NULL,
    descriptions JSONB DEFAULT '{}'::jsonb,
    parent_class_key VARCHAR(100),
    
    -- Control de Sincronización entre Workspaces
    mirrored_from_workspace_id UUID REFERENCES auth.workspaces(id),
    
    status VARCHAR(20) DEFAULT 'PROPOSED',   -- 'PROPOSED', 'ACTIVE', 'DEPRECATED'
    approval_score INT DEFAULT 0,
    proposed_by VARCHAR(64) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_class_per_workspace UNIQUE (workspace_id, system_key)
);

CREATE TABLE meta.datatype_properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES auth.workspaces(id) ON DELETE CASCADE,
    system_key VARCHAR(100) NOT NULL,
    display_names JSONB NOT NULL,
    descriptions JSONB DEFAULT '{}'::jsonb,
    data_type VARCHAR(30) NOT NULL,
    enum_values JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(20) DEFAULT 'PROPOSED',
    approval_score INT DEFAULT 0,
    proposed_by VARCHAR(64) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_datatype_per_workspace UNIQUE (workspace_id, system_key)
);

CREATE TABLE meta.object_properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES auth.workspaces(id) ON DELETE CASCADE,
    system_key VARCHAR(100) NOT NULL,
    display_names JSONB NOT NULL,
    descriptions JSONB DEFAULT '{}'::jsonb,
    is_directional BOOLEAN DEFAULT TRUE,
    status VARCHAR(20) DEFAULT 'PROPOSED',
    approval_score INT DEFAULT 0,
    proposed_by VARCHAR(64) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_object_prop_per_workspace UNIQUE (workspace_id, system_key)
);

CREATE TABLE meta.ontology_restrictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES auth.workspaces(id) ON DELETE CASCADE,
    domain_class_key VARCHAR(100) NOT NULL,
    datatype_property_key VARCHAR(100),
    is_required BOOLEAN DEFAULT FALSE,
    object_property_key VARCHAR(100),
    range_class_key VARCHAR(100),
    validation_rules JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) DEFAULT 'PROPOSED',
    approval_score INT DEFAULT 0,
    proposed_by VARCHAR(64) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 3. DOMINIO DEL GRAFO DE DATOS (schema: public)
-- =============================================================================

CREATE TABLE public.nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES auth.workspaces(id) ON DELETE CASCADE,
    type_key VARCHAR(100) NOT NULL,
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

CREATE INDEX idx_nodes_workspace ON public.nodes(workspace_id);
CREATE INDEX idx_nodes_embedding ON public.nodes USING hnsw (embedding vector_cosine_ops);

CREATE TABLE public.edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES auth.workspaces(id) ON DELETE CASCADE,
    source_node_id UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    target_node_id UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    relation_key VARCHAR(100) NOT NULL,
    attributes JSONB DEFAULT '{}'::jsonb,
    upvotes INT DEFAULT 0,
    downvotes INT DEFAULT 0,
    community_score INT GENERATED ALWAYS AS (upvotes - downvotes) STORED,
    created_by VARCHAR(64) NOT NULL,
    status VARCHAR(20) DEFAULT 'PROPOSED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_edge UNIQUE (workspace_id, source_node_id, target_node_id, relation_key)
);

CREATE TABLE public.edit_proposals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES auth.workspaces(id) ON DELETE CASCADE,
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
    workspace_id UUID NOT NULL REFERENCES auth.workspaces(id) ON DELETE CASCADE,
    user_hash VARCHAR(64) NOT NULL,
    target_id UUID NOT NULL,
    target_type VARCHAR(30) NOT NULL,
    action_type VARCHAR(30) NOT NULL,
    vote_value INT NOT NULL CHECK (vote_value IN (-1, 1)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_target_vote UNIQUE (workspace_id, user_hash, target_id, target_type)
);

-- =============================================================================
-- 4. CAPA SOCIAL NORMALIZADA (schema: social)
-- =============================================================================

CREATE TABLE social.discussion_threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES auth.workspaces(id) ON DELETE CASCADE,
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
