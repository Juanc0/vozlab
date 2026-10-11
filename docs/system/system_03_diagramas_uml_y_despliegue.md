---
title: Especificación de Diagramas UML, Arquitectura y Despliegue
version: 1.0.0
status: APPROVED
target_component: System Wide
owner: Architecture & Infrastructure Team (VozLab)
---

# 03. DIAGRAMAS UML, ARQUITECTURA Y DESPLIEGUE

## 1. Visión Estructural de Datos (Entity-Relationship Diagram - ERD)

El modelo de datos unificado convive en **PostgreSQL 16+** estructurado en cuatro esquemas principales: `auth` (identidad y multi-tenancy), `meta` (ontología dinámica), `public` (dominio del grafo y relaciones) y `social` (hilos de discusión e interacciones).

```mermaid
erDiagram
    %% ESQUEMA AUTH
    auth_tenants ||--o{ auth_workspaces : "contiene"
    auth_users ||--o{ auth_workspace_memberships : "pertenece"
    auth_workspaces ||--o{ auth_workspace_memberships : "asigna"

    %% ESQUEMA META
    auth_workspaces ||--o{ meta_ontology_classes : "define"
    meta_ontology_classes ||--o{ meta_ontology_restrictions : "aplica_dominio"
    meta_ontology_classes ||--o{ meta_ontology_restrictions : "aplica_rango"

    %% ESQUEMA PUBLIC (GRAFO)
    auth_workspaces ||--o{ public_nodes : "aísla"
    meta_ontology_classes ||--|| public_nodes : "tipifica"
    public_nodes ||--o{ public_edges : "origen"
    public_nodes ||--o{ public_edges : "destino"
    public_nodes ||--o{ public_edit_proposals : "recibe_propuesta"

    %% ESQUEMA SOCIAL
    public_nodes ||--o{ social_discussion_threads : "discute"
    social_discussion_threads ||--o{ social_discussion_posts : "agrupa"
    public_nodes ||--o{ public_interactions_log : "registra_voto"

    auth_tenants {
        uuid id PK
        string slug UK
        string oidc_tenant_id UK
    }

    auth_workspaces {
        uuid id PK
        string slug UK
        boolean is_public
    }

    public_nodes {
        uuid id PK
        uuid workspace_id FK
        string type_key FK
        string title
        text description
        jsonb attributes
        vector_768 embedding
        string author_hash
        string status
    }

    public_edges {
        uuid id PK
        uuid source_node_id FK
        uuid target_node_id FK
        string relation_key
        int community_score
        string created_by
    }

    public_edit_proposals {
        uuid id PK
        uuid target_id
        string target_type
        jsonb proposed_changes
        string proposer_hash
        string status
    }

    public_interactions_log {
        uuid id PK
        string user_hash
        uuid target_id
        int vote_value
    }

```

---

## 2. Diagrama de Clases del Domain Core (Arquitectura Hexagonal)

Representación orientada a objetos de la capa de Dominio e Interfaces (Puertos) aisladas de la infraestructura HTTP/DB en la API Fastify.

```mermaid
classDiagram
    class Node {
        +UUID id
        +UUID workspaceId
        +SystemKey typeKey
        +String title
        +String description
        +Map attributes
        +AuthorHash authorHash
        +NodeStatus status
        +updateAttributes(Map delta)
        +changeStatus(NodeStatus newStatus)
    }

    class EditProposal {
        +UUID id
        +UUID targetId
        +TargetType targetType
        +AuthorHash proposerHash
        +Map proposedChanges
        +ProposalStatus status
        +approve(AuthorHash resolver)
        +reject(AuthorHash resolver)
    }

    class INodeRepository {
        <<interface>>
        +findById(UUID id) Node
        +save(Node node) void
        +update(Node node) void
    }

    class IProposalRepository {
        <<interface>>
        +findPendingByTarget(UUID targetId) List~EditProposal~
        +save(EditProposal proposal) void
        +updateStatus(UUID id, ProposalStatus status) void
    }

    class IUnitOfWork {
        <<interface>>
        +runInTransaction(Function work) Any
    }

    class ApproveProposalUseCase {
        -INodeRepository nodeRepo
        -IProposalRepository proposalRepo
        -IUnitOfWork uow
        +execute(UUID proposalId, AuthorHash executorHash) void
    }

    ApproveProposalUseCase --> INodeRepository
    ApproveProposalUseCase --> IProposalRepository
    ApproveProposalUseCase --> IUnitOfWork
    INodeRepository ..> Node
    IProposalRepository ..> EditProposal

```

---

## 3. Diagrama de Máquina de Estados (Ciclo de Vida de Entidades)

### 3.1. Estado de una Propuesta de Edición (Pull Request)

```mermaid
stateDiagram-v2
    [*] --> PENDING : Usuario crea propuesta (US-03)
    
    PENDING --> APPROVED_BY_AUTHOR : Mantenedor aprueba (US-06)
    PENDING --> REJECTED_BY_AUTHOR : Mantenedor rechaza (US-06)
    PENDING --> AUTO_APPLIED : Moderador aprueba por inactividad (>14d, +10 score) (US-09)
    
    APPROVED_BY_AUTHOR --> [*] : Se aplican cambios al Nodo
    REJECTED_BY_AUTHOR --> [*] : El Nodo permanece intacto
    AUTO_APPLIED --> [*] : Se aplican cambios al Nodo

```

### 3.2. Estado de Nodos e Ingesta de la IA

```mermaid
stateDiagram-v2
    [*] --> DRAFT : Agente Extractor genera borrador
    [*] --> ACTIVE : Usuario crea Nodo en PWA directamente
    
    DRAFT --> ACTIVE : Usuario/Moderador valida y publica
    ACTIVE --> MERGED : Agente 2 / Autor fusiona con otro nodo
    ACTIVE --> DEPRECATED : Obsoletado por la comunidad
    
    MERGED --> [*]
    DEPRECATED --> [*]

```

---

## 4. Diagrama de Secuencia: Ingesta, Evaluación y Reacción en Tiempo Real

Flujo asíncrono desde la ingesta atómica del Agente 1, la emisión a Redis Streams, la evaluación semántica cualitativa del Agente 2 y la notificación en tiempo real a la PWA.

```mermaid
sequenceDiagram
    autonumber
    participant Fuente as Fuente Universitaria
    participant Agente1 as Worker Extractor (Python)
    participant API as Fastify API
    participant DB as PostgreSQL (AGE + pgvector)
    participant Redis as Redis Streams
    participant Agente2 as Worker Relacionador (Python)
    participant PWA as PWA Client (SvelteKit 5)

    Fuente->>Agente1: Envía registro de encuesta/buzón
    Agente1->>Agente1: Anonimiza PII y homogeneiza
    Agente1->>API: POST /api/v1/nodes (DRAFT)
    API->>DB: Guarda Nodo
    API->>Redis: Publica evento NODE_CREATED { nodeId, workspaceId }
    API-->>Agente1: 201 Created (5 ms)

    Redis->>Agente2: Consume evento NODE_CREATED
    Agente2->>DB: Consulta Top 5 Vectores HNSW y Centroides
    DB-->>Agente2: Devuelve Nodos y Resúmenes de Clusters
    Agente2->>Agente2: Evalúa semántica con LLM (Duplicado, Arista o Independiente)
    
    alt Detecta Complementariedad
        Agente2->>API: POST /api/v1/proposals (Sugerencia de Arista)
        API->>DB: Guarda Arista (Status: PROPOSED)
        API->>PWA: Emite evento SSE (Refresca Cytoscape.js)
    end

```

---

## 5. Diagrama de Despliegue e Infraestructura Física (Deployment)

Topología de contenedores en producción sobre cluster gestionado (Kubernetes / Docker Swarm) con aislamiento multi-tenant y conexión al motor Ollama.

```mermaid
architecture-beta
    group cloud_provider(cloud)[Nube / Servidor Institucional]

    service ingress(internet)[Ingress Controller / Nginx] in cloud_provider
    service pwa_node(server)[PWA SvelteKit SSR] in cloud_provider
    service api_node(server)[Fastify API Container] in cloud_provider
    service worker_ext(server)[Python Extractor Worker] in cloud_provider
    service worker_rel(server)[Python Relacionador Worker] in cloud_provider
    service worker_con(server)[Python Consolidador Worker] in cloud_provider
    
    service postgres_db(database)[PostgreSQL 16 + AGE + pgvector] in cloud_provider
    service redis_cluster(database)[Redis 7 Streams & Cache] in cloud_provider
    service ollama_service(disk)[Ollama Local LLM API] in cloud_provider

    ingress:R --> L:pwa_node
    ingress:B --> T:api_node
    
    api_node:R --> L:postgres_db
    api_node:B --> T:redis_cluster
    
    worker_ext:R --> L:api_node
    worker_rel:T --> B:redis_cluster
    worker_rel:R --> L:postgres_db
    worker_rel:B --> T:ollama_service
    
    worker_con:R --> L:postgres_db
    worker_con:B --> T:ollama_service

```
