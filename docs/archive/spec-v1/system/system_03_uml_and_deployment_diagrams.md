---
title: UML, Architecture and Deployment Diagrams Specification
version: 1.0.0
status: APPROVED
target_component: System Wide
owner: Architecture & Infrastructure Team (VozLab)
---

# 03. UML, ARCHITECTURE AND DEPLOYMENT DIAGRAMS

## 1. Structural Data View (Entity-Relationship Diagram - ERD)

The unified data model coexists in **PostgreSQL 16+** structured in four main schemas: `auth` (identity and multi-tenancy), `meta` (dynamic ontology), `public` (graph domain and relationships) and `social` (discussion threads and interactions).

```mermaid
erDiagram
    %% AUTH SCHEMA
    auth_tenants ||--o{ auth_workspaces : "contains"
    auth_users ||--o{ auth_workspace_memberships : "belongs"
    auth_workspaces ||--o{ auth_workspace_memberships : "assigns"

    %% META SCHEMA
    auth_workspaces ||--o{ meta_ontology_classes : "defines"
    meta_ontology_classes ||--o{ meta_ontology_restrictions : "applies_domain"
    meta_ontology_classes ||--o{ meta_ontology_restrictions : "applies_range"

    %% PUBLIC SCHEMA (GRAPH)
    auth_workspaces ||--o{ public_nodes : "isolates"
    meta_ontology_classes ||--|| public_nodes : "types"
    public_nodes ||--o{ public_edges : "source"
    public_nodes ||--o{ public_edges : "target"
    public_nodes ||--o{ public_edit_proposals : "receives_proposal"

    %% SOCIAL SCHEMA
    public_nodes ||--o{ social_discussion_threads : "discusses"
    social_discussion_threads ||--o{ social_discussion_posts : "groups"
    public_nodes ||--o{ public_interactions_log : "records_vote"

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

## 2. Domain Core Class Diagram (Hexagonal Architecture)

Object-oriented representation of the Domain and Interfaces (Ports) layer, isolated from the HTTP/DB infrastructure in the Fastify API.

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

## 3. State Machine Diagram (Entity Lifecycle)

### 3.1. State of an Edit Proposal (Pull Request)

```mermaid
stateDiagram-v2
    [*] --> PENDING : User creates proposal (US-03)
    
    PENDING --> APPROVED_BY_AUTHOR : Maintainer approves (US-06)
    PENDING --> REJECTED_BY_AUTHOR : Maintainer rejects (US-06)
    PENDING --> AUTO_APPLIED : Moderator approves due to inactivity (>14d, +10 score) (US-09)
    
    APPROVED_BY_AUTHOR --> [*] : Changes are applied to the Node
    REJECTED_BY_AUTHOR --> [*] : The Node remains intact
    AUTO_APPLIED --> [*] : Changes are applied to the Node

```

### 3.2. State of Nodes and AI Ingestion

```mermaid
stateDiagram-v2
    [*] --> DRAFT : Extractor Agent generates draft
    [*] --> ACTIVE : User creates Node in PWA directly
    
    DRAFT --> ACTIVE : User/Moderator validates and publishes
    ACTIVE --> MERGED : Agent 2 / Author merges with another node
    ACTIVE --> DEPRECATED : Made obsolete by the community
    
    MERGED --> [*]
    DEPRECATED --> [*]

```

---

## 4. Sequence Diagram: Ingestion, Evaluation and Real-Time Reaction

Asynchronous flow from Agent 1's atomic ingestion, the emission to Redis Streams, Agent 2's qualitative semantic evaluation and the real-time notification to the PWA.

```mermaid
sequenceDiagram
    autonumber
    participant Fuente as University Source
    participant Agente1 as Worker Extractor (Python)
    participant API as Fastify API
    participant DB as PostgreSQL (AGE + pgvector)
    participant Redis as Redis Streams
    participant Agente2 as Worker Relator (Python)
    participant PWA as PWA Client (SvelteKit 5)

    Fuente->>Agente1: Sends survey/suggestion box record
    Agente1->>Agente1: Anonymizes PII and homogenizes
    Agente1->>API: POST /api/v1/nodes (DRAFT)
    API->>DB: Saves Node
    API->>Redis: Publishes NODE_CREATED event { nodeId, workspaceId }
    API-->>Agente1: 201 Created (5 ms)

    Redis->>Agente2: Consumes NODE_CREATED event
    Agente2->>DB: Queries Top 5 HNSW Vectors and Centroids
    DB-->>Agente2: Returns Nodes and Cluster Summaries
    Agente2->>Agente2: Evaluates semantics with LLM (Duplicate, Edge or Independent)
    
    alt Detects Complementarity
        Agente2->>API: POST /api/v1/proposals (Edge Suggestion)
        API->>DB: Saves Edge (Status: PROPOSED)
        API->>PWA: Emits SSE event (Refreshes Cytoscape.js)
    end

```

---

## 5. Deployment and Physical Infrastructure Diagram (Deployment)

Container topology in production on a managed cluster (Kubernetes / Docker Swarm) with multi-tenant isolation and connection to the Ollama engine.

```mermaid
architecture-beta
    group cloud_provider(cloud)[Cloud / Institutional Server]

    service ingress(internet)[Ingress Controller / Nginx] in cloud_provider
    service pwa_node(server)[PWA SvelteKit SSR] in cloud_provider
    service api_node(server)[Fastify API Container] in cloud_provider
    service worker_ext(server)[Python Extractor Worker] in cloud_provider
    service worker_rel(server)[Python Relator Worker] in cloud_provider
    service worker_con(server)[Python Consolidator Worker] in cloud_provider
    
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
