
---
title: Architecture Overview and Monorepo Structure
version: 1.3.0
status: APPROVED
target_component: System Core
owner: Architecture Team (VozLab)
---

# 00. ARCHITECTURE OVERVIEW (VOZLAB)

## 1. Platform Mission and Global Topology

**VozLab** is a B2B/Institutional infrastructure designed to articulate the various listening, participation, and support mechanisms that today operate independently at the University[cite: 10]. 

The platform combines **Deterministic Computing at the Database Level (PostgreSQL + Apache AGE + pgvector)** with a **Trio of Specialized AI Agents** that provide non-deterministic semantic reasoning[cite: 10], transforming scattered information into **Consolidated Improvement Opportunities** for community co-creation[cite: 10].

```mermaid
C4Context
    title System Context Diagram (C4 Level 1) - VozLab

    Person(user, "Community / Allies", "Students, Faculty, Admin, and External Allies")
    Person(admin, "Admin / Champions", "Process Leaders and Institutional Champions")

    System(vozlab, "VozLab Platform", "Articulating layer for listening, knowledge graphs, and co-creation")

    System_Ext(fuentes, "Univalle Listening Sources", "Surveys, suggestion boxes, meeting minutes, support channels")
    System_Ext(oidc, "Institutional IdP", "Azure AD / Google Workspace (OIDC)")
    System_Ext(ollama, "LLM / Embeddings Engine", "Vector models and reasoning LLMs")

    Rel(fuentes, vozlab, "Ingestion of non-confidential data (Stream/Batch)", "API/Connectors")
    Rel(user, vozlab, "Enriches, supports, comments, and proposes in the PWA", "HTTPS / PWA")
    Rel(admin, vozlab, "Manages co-creation and validation workshops", "HTTPS")
    Rel(vozlab, oidc, "Authenticates users via SSO", "HTTPS")
    Rel(vozlab, ollama, "Generates embeddings and evaluates semantic relationships", "HTTP/REST")

```

---

## 2. Monorepo Structure (`pnpm` + Turborepo)

```
vozlab/
├── .dev-state/                      <-- Development state for Local Agents
│   ├── roadmap.json
│   ├── current_task.json
│   └── changelog_dev.md
├── apps/
│   ├── web/                         <-- PWA Frontend (SvelteKit 5 + Cytoscape.js)
│   ├── api/                         <-- Main Backend (Fastify + TypeScript + Drizzle)
│   ├── worker-extractor/            <-- AGENT 1: Ingestion and Structuring (Python 3.12)
│   ├── worker-relacionador/         <-- AGENT 2: Relationship and Cluster Evaluator (Python 3.12)
│   └── worker-consolidador/         <-- AGENT 3: Opportunity Consolidator (Python 3.12)
├── packages/
│   ├── shared-types/                <-- Shared Zod Schemas and DTO Contracts (Web/API)
│   ├── database/                    <-- Drizzle Schemas, Apache AGE (Cypher), and Migrations
│   └── ts-config/                   <-- Base TypeScript Configurations
├── docker-compose.yml               <-- Local environment (PostgreSQL+AGE+pgvector, Redis)
├── pnpm-workspace.yaml              <-- pnpm Workspaces definition
└── turbo.json                       <-- Turborepo build pipeline

```

---

## 3. Container Diagram (C4 Level 2)

```mermaid
C4Container
    title Container Diagram (C4 Level 2) - VozLab

    Container_Ext(sources, "University Sources", "Listening channels", "Surveys, suggestion boxes, meeting minutes, comments")
    
    Container(worker_ext, "Agent 1: Extractor", "Python 3.12 + Parsers", "Atomic ingestion, homogenizes and classifies initial metadata")
    Container(pwa, "PWA Client", "SvelteKit 5 + Cytoscape.js", "Gamified co-creation app (Web & UniSabana App)")
    Container(api, "Fastify API", "Node.js 20 + Fastify", "Business API, validates JWT, applies rules, and manages the Graph")
    Container(redis, "Redis Broker & Cache", "Redis Streams", "Atomic event queue (NODE_CREATED) and ontology cache")
    ContainerDb(db, "PostgreSQL 16+", "Postgres + Apache AGE + pgvector", "Unified persistence: SQL, LPG Graph, HNSW Vectors, and Centroids")
    
    Container(worker_rel, "Agent 2: Relator", "Python 3.12 + LLM", "Evaluates semantic similarity against nodes and centroids of active clusters")
    Container(worker_con, "Agent 3: Consolidator", "Python 3.12 + Scheduled LLM", "Synthesizes dense clusters into Improvement Opportunities with evidence")

    Rel(sources, worker_ext, "Reads records from channels", "JSON / Text / Streams")
    Rel(worker_ext, api, "Creates preliminary Nodes and Edges", "HTTP POST /api/v1/nodes")
    Rel(pwa, api, "Community co-creation interactions", "HTTPS / SSE")
    Rel(api, db, "Queries and Transactions", "Drizzle / postgres.js")
    Rel(api, redis, "Emits new node events", "Stream: NODE_CREATED")
    
    Rel(worker_rel, redis, "Consumes NODE_CREATED", "Redis Streams")
    Rel(worker_rel, db, "Requests top N nearby Nodes/Centroids", "SQL / pgvector")
    Rel(worker_rel, api, "Proposes Merge or new Edge", "HTTP POST /api/v1/proposals")
    
    Rel(worker_con, db, "Queries dense clusters/interactions in the DB", "SQL / Cypher")
    Rel(worker_con, api, "Publishes synthesized Consolidated Opportunities", "HTTP POST /api/v1/opportunities")

```

---

## 4. Detailed Flow of the 3 AI Agents

```mermaid
flowchart TD
    subgraph "AGENT 1: Extractor (Multi-Source Ingestion)"
        A[Institutional Source: Survey/Minutes] -->|Atomic Record| B(Extractor Agent)
        B -->|Parses and homogenizes| C[POST /api/v1/nodes - Fastify]
        C -->|Saves Node in DB| D[(PostgreSQL / Apache AGE)]
        C -->|Emits Event| E[Redis Stream: NODE_CREATED]
    end

    subgraph "AGENT 2: Non-Deterministic Relator (Qualitative Analysis)"
        E --> F(Relator Agent)
        F -->|1. Requests Nearby Vectors/Centroids| D
        D -->|2. Returns Nodes + Cluster Summaries| F
        F -->|3. Qualitative LLM Reasoning| G{Is it a Duplicate, Edge, or Independent?}
        G -->|Option A: Duplicate| H[Proposes MERGED_INTO]
        G -->|Option B: Complementary| I[Proposes Edge / Relationship]
        G -->|Option C: New Nuance| J[Keeps Node Independent]
        H & I & J -->|Notifies API| C
    end

    subgraph "AGENT 3: Consolidator (Macroscopic Synthesis)"
        K[Scheduled Job / Cron] -->|1. Queries Graph Density and Votes| D
        D -->|2. Returns Candidate Clusters| K
        K -->|3. Drafts Improvement Opportunity| L{LLM Synthesizer}
        L -->|4. Publishes Opportunity| M[PWA App for Co-creation]
    end

```

---

## 5. Agent Responsibilities and Loads

| Agent | Trigger / Frequency | Input Delivered by the DB | Non-Deterministic LLM Task | Output |
| --- | --- | --- | --- | --- |
| **Agent 1: Extractor** | Live per channel | Raw text from the source | Homogenize the format and extract the central idea with ontological metadata. | Draft node via API. |
| **Agent 2: Relator** | `NODE_CREATED` event | New node + Top 5 nearby Nodes + Centroids of Active Clusters | Determine whether the node brings enough nuance to be independent or whether it must be merged/related. | Edit/edge proposal. |
| **Agent 3: Consolidator** | Scheduled (Cron / Batch) | Groups of nodes and conversations with high community interaction | Draft the **Consolidated Improvement Opportunity** synthesizing all the aggregated evidence. | Opportunity in PWA. |

---

## 6. Global Edge Cases and Continuous Learning

> [!NOTE]
> **Semi-Supervised Learning:** When the community votes, comments, or the author approves/rejects a suggestion from Agent 2, this interaction is fed back into the system to adjust the Relator Agent's thresholds.
> 
> 

1. **Graph Isolation per Workspace:** Agent 2's relationship suggestions occur strictly within the same `workspace_id`.
2. **LLM Connectivity Failures:** If Ollama/LLM does not respond during Agent 2's evaluation, the task is not lost; it remains retained in Redis Streams for automatic re-evaluation.
3. **Data-Source → Workspace Mapping:** The API owns the registry of institutional sources (`meta.data_sources`). Workers never choose a workspace; they query the API to resolve the `source_id` to its target workspace and authorization context.
