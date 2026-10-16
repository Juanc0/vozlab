---
title: Functional Requirements (FR) and Non-Functional Requirements (NFR) Specification
version: 1.0.0
status: APPROVED
target_component: System Wide
owner: Architecture & Product Team (VozLab)
---

# 01. FUNCTIONAL AND NON-FUNCTIONAL REQUIREMENTS SPECIFICATION

## 1. Functional Requirements (FR)

Functional requirements define the behaviors and operational capabilities that the system must provide to the different actors and services.

### 1.1. Identity, Authentication and Multi-Tenancy

* **FR-01 (Delegated OIDC/SSO Authentication):** The system must authenticate institutional users exclusively through external identity providers (Microsoft Entra ID / Azure AD, Google Workspace) using the OpenID Connect (OIDC) protocol. No local passwords will be stored.
* **FR-02 (Tenant Isolation by OIDC Claim):** The backend must determine the user's Tenant by extracting the `tid` or `iss` *claim* from the signed JWT token and validating its registration in the `auth.tenants` table.
* **FR-03 (Anonymous Access via Event QR Code):** The system must allow the registration of ephemeral sessions for in-person events/workshops through an `event_code`. A random pseudonym and a signed device token will be assigned. Once the event has ended, the creation of new anonymous users is blocked, but existing ones retain their access to follow up on their contributions.
* **FR-04 (Multi-Workspace Management in a Clean URL):** The PWA must keep the public URL clean (`app.vozlab.io/`) and manage the workspace context (`workspace_id`) in isolation within the `sessionStorage` of each tab.
* **FR-05 (Stateless Zero-Trust Validation):** Every HTTP/REST request sent by the PWA must include the `X-Workspace-ID` header. The Fastify backend must validate the user's membership and permissions on that specific space on every query.

---

### 1.2. Knowledge Graph Domain and Metamodel

* **FR-06 (Dynamic Node Creation):** The system must allow the creation of Nodes (Problems, Ideas, Resources) by dynamically building the capture form based on the attributes (`datatype_properties`) defined in the Workspace's active ontology (`meta.*`).
* **FR-07 (Maintainer/Author Assignment):** Every entity created in the system (Node, Edge or Ontological Proposal) must associate the creator's `author_hash`, granting them the non-waivable role of **Maintainer** over that object.
* **FR-08 (Directed Edge Creation):** The system must allow connecting two existing nodes through a typed relationship (`object_properties`), validating the domain and range restrictions of the active ontology.
* **FR-09 (Collaborative Dynamic Metamodel):** Users must be able to propose new types of Nodes, Edges or Attributes. The proposals will be stored in `meta.*` with `PROPOSED` status and may be used locally as a draft before their community or institutional approval.

---

### 1.3. Collaborative Governance (Pull Request-style Flow)

* **FR-10 (Polymorphic Edit Proposals):** Any authenticated user may propose corrections or additions to Nodes, Edges or Ontological Classes belonging to others. The suggestion will be recorded in `public.edit_proposals` as a delta (`proposed_changes JSONB`) in `PENDING` status.
* **FR-11 (Social Linking):** Each edit proposal must open or be linked to a thread in `social.discussion_threads` so that the community can debate and cast informative supporting votes (`upvotes` / `downvotes`).
* **FR-12 (Maintainer Approval/Rejection - Merge):** The Maintainer (original author) of the object must have the exclusive power to approve (`APPROVED_BY_AUTHOR`) or reject (`REJECTED_BY_AUTHOR`) the proposal. Approval must apply the changes atomically in a `UnitOfWork` transaction.
* **FR-13 (Moderator-Supervised Unlocking):** If an edit proposal accumulates a `community_score >= +10` and the Maintainer remains inactive for more than 14 days, an authorized Moderator/Committee may supervisedly approve the edit (`AUTO_APPLIED`).

---

### 1.4. Gamified Interaction and Co-creation

* **FR-14 (Immutable Interaction Log):** Every community action (supporting, rating, commenting or validating relationships) must be recorded in `public.interactions_log`, guaranteeing the restriction of a single active vote per user and target (`unique_user_target_vote`).
* **FR-15 (Atomic Score Update):** The database must update the denormalized counters (`upvotes`, `downvotes`, `community_score`) atomically with $\mathcal{O}(1)$ latency.
* **FR-16 (Comments and Thread Discussions):** The system must support normalized hierarchical discussion threads in `social.discussion_posts`, allowing direct replies and granular voting per individual comment.

---

### 1.5. Artificial Intelligence Pipeline (The 3 Agents)

* **FR-17 (Agent 1 - Atomized Multi-Source Ingestion):** The **Extractor Agent** must connect with university listening channels (surveys, suggestion boxes, meeting minutes), homogenize the non-confidential data record by record and create Node/Edge drafts by consuming the Fastify API.
* **FR-18 (Vector Embedding Generation):** The Fastify API must emit an event to Redis Streams (`NODE_CREATED`) so that the system asynchronously computes the 768-dimensional vector (`nomic-embed-text`) and indexes it in the `embedding` column (`pgvector`).
* **FR-19 (Agent 2 - Non-Deterministic Relationship Evaluator):** The **Relator Agent** must evaluate new nodes by qualitatively contrasting them against the closest Active Clusters' Nodes and Centroids returned by `pgvector`. The AI will decide whether the node merges (`MERGED_INTO`), whether it requires a new Edge, or whether it remains independent because it contributes a new nuance.
* **FR-20 (Agent 3 - Opportunity Consolidator):** The **Consolidator Agent** must run a scheduled process (Cron) that analyzes subgraph density and community interactions in order to draft and publish in the PWA the **"Consolidated Improvement Opportunity"**, synthesizing all the aggregated evidence.

---

## 2. Non-Functional Requirements (NFR)

Non-functional requirements establish the technical constraints, quality attributes, performance and security of the system.

### 2.1. Performance and Scale

* **NFR-01 (Subgraph Query Latency):** Subgraph queries for the PWA (<200 nodes) must respond with a time of $p_{95} < 30\text{ ms}$.
* **NFR-02 (HNSW Vector Search):** Cosine similarity searches in `pgvector` over a set of 100,000 vectors must respond in $p_{95} < 20\text{ ms}$.
* **NFR-03 (HTTP Response Times):** Mutation endpoints (votes, node creation) must respond in $p_{95} < 15\text{ ms}$ by delegating heavy processing to asynchronous workers via Redis Streams.
* **NFR-04 (Efficient Cursor-Based Pagination):** All lists (posts, proposals, suggestions) must implement cursor-based pagination (`cursor-based pagination`), guaranteeing constant $\mathcal{O}(1)$ performance regardless of data volume.

---

### 2.2. Security and Privacy

* **NFR-05 (Zero Password Storage):** The system will not store or process passwords in its databases.
* **NFR-06 (PII Anonymization at Ingestion):** The Extractor Agent must filter and anonymize any Personally Identifiable Information (PII) before entering records into the system.
* **NFR-07 (Pseudonymous Traceability):** The user's public identity in the Graph will always be abstracted behind an `author_hash` (SHA-256 of the identity with institutional salt), preventing the direct exposure of personal data in the visible graph.
* **NFR-08 (Anti-Abuse Protection / Rate Limiting):** The Fastify API must implement Rate Limiting per IP/Tenant backed by Redis:
  * Read routes (`GET`): Maximum 300 requests/minute.
  * Write routes (`POST`/`PUT`/`DELETE`): Maximum 30 requests/minute.

---

### 2.3. Availability and Maintainability

* **NFR-09 (Service Availability):** The Backend API and the PWA Frontend must offer a $99.9\%$ availability SLA during institutional operating hours.
* **NFR-10 (AI-Decoupled Resilience):** If the LLM or Embeddings services (Ollama) go offline, the PWA and the Fastify API must continue to operate at 100%. AI tasks will accumulate in Redis Streams and will be processed automatically once the service is restored.
* **NFR-11 (Strict Hexagonal Architecture):** The Backend code must maintain decoupling between the Domain, Use Cases and Infrastructure layers (Ports and Adapters), allowing database engines or AI adapters to be swapped without modifying the business logic.

---

## 3. Cross-Traceability Matrix

| Requirement | User Stories | Code Component | Tables / Persistence |
| :--- | :--- | :--- | :--- |
| **FR-01, FR-02** | US-00, US-05 | `apps/api/src/infrastructure/identity/` | `auth.tenants`, `auth.users` |
| **FR-06, FR-07** | US-01 | `apps/api/src/application/use_cases/CreateNode.ts` | `public.nodes`, `meta.ontology_classes` |
| **FR-10, FR-12** | US-03, US-06 | `apps/api/src/application/use_cases/ApproveProposal.ts` | `public.edit_proposals`, `public.nodes` |
| **FR-14, FR-15** | US-04 | `apps/api/src/application/use_cases/VoteEntity.ts` | `public.interactions_log`, `public.edges` |
| **FR-17** | US-07 | `apps/worker-extractor/` | Fastify API (`POST /api/v1/nodes`) |
| **FR-18, FR-19** | US-08 | `apps/worker-relacionador/` | `pgvector`, `public.edit_proposals` |
| **FR-20** | US-08 | `apps/worker-consolidador/` | `public.nodes`, `social.discussion_threads` |
