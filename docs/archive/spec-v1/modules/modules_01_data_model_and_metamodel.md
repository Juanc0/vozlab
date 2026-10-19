---
title: "Module Specification: Data Model, Drizzle ORM and Apache AGE"
version: 1.0.0
status: APPROVED
target_component: Database Layer (PostgreSQL)
owner: Database & Backend Team (VozLab)
---

# 01. DATA MODEL, METAMODEL AND PERSISTENCE (VOZLAB)

## 1. Persistence Engine Topology (PostgreSQL 16+)

VozLab uses **PostgreSQL 16+** as a unified persistence engine within the exclusive physical database of each institution, integrating three paradigms in the same instance to avoid state desynchronization:

1. **Relational and Documental (Drizzle ORM + JSONB):** Modeling of the `auth`, `meta`, `public` and `social` schemas.
2. **LPG Graph (Apache AGE):** Native Cypher navigation for ontological traces and complex relationships between nodes.
3. **Vector Search (`pgvector`):** 768-dimensional vectors with an HNSW index for semantic search and cosine similarity.

---

## 2. Universal Governance and Polymorphic Structure

Every object created in the system — whether a node, an edge proposed by the Relator Agent, or a contribution from a common user — is born under a transient governance state, linked to a discussion and community voting thread.

* **Valid States:** `DRAFT` | `PENDING` | `ACTIVE` | `REJECTED`.
* **Logical deletion policy:** Deletion is entity-specific, not universal. Every entity that supports
  deletion keeps its history; nothing is ever hard-deleted. Soft-deleted rows are filtered out of
  every read path (lookup, list, subgraph) and only ever stamped by the repository (single writer).

  | Table / entity | Deletion mechanism | Read filter | Delete endpoint |
  | --- | --- | --- | --- |
  | `public.nodes` | `deleted_at` (timestamp) | yes (`findById`, `listByWorkspace`, `getSubgraph`) | `DELETE /api/v1/nodes/:id` (author-only, 204) |
  | `public.edges` | `deleted_at` (timestamp) | yes (`findById`, `listByWorkspace`, `getSubgraph`) | `DELETE /api/v1/edges/:id` (author-only, 204) |
  | `social.discussion_posts` | `deleted_at` (timestamp) | yes (`listPosts`, `findPostById`) | `DELETE /api/v1/discussions/posts/:id` (author-only, 204) |
  | `social.discussion_threads` | status (`OPEN` / `CLOSED`) | n/a — no `deleted_at` | `PUT /api/v1/discussions/:threadId/close` (creator-only) |
  | `public.edit_proposals` | status (`PENDING` / `APPROVED` / `REJECTED`) | n/a — no `deleted_at` | none (governance transitions) |
  | `meta.ontology_*` | status (`PROPOSED` / `ACTIVE` / `REJECTED`) | n/a — no `deleted_at` | none (governance transitions) |
  | `public.interactions_log` | **immutable** — never deleted | n/a | none |

  Consequences: deleting a node does **not** cascade to its edges at the domain level — both are
  soft-deleted independently, and a node's deletion never mutates or removes edges. A delete of an
  entity that is already deleted (or belongs to another workspace) is reported as not-found, so a
  repeated client call is idempotent. Non-authors get `403 ERR_AUTHORIZATION_FAILED`; a
  foreign-workspace or missing row gets `404` (never `403`, so existence is not leaked).

---

## 3. Schema Definitions in Drizzle ORM (`packages/database/src/schema/`)

### 3.1. Tenant Identity and Workspaces Schema (`auth.ts`)

*(Note: This schema resides within the Tenant's independent physical database.)*

```typescript
import { pgSchema, uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';

export const authSchema = pgSchema('auth');

export const workspaces = authSchema.table('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: varchar('description', { length: 500 }),
  isPublic: boolean('is_public').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = authSchema.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).unique(),
  fullName: varchar('full_name', { length: 255 }),
  provider: varchar('provider', { length: 50 }).notNull(), // 'OIDC_INSTITUTIONAL' | 'ANONYMOUS_EVENT'
  providerUserId: varchar('provider_user_id', { length: 255 }),
  authorHash: varchar('author_hash', { length: 64 }).notNull().unique(),
  anonymousAlias: varchar('anonymous_alias', { length: 100 }),
  systemRole: varchar('system_role', { length: 30 }).default('USER').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const workspaceMemberships = authSchema.table('workspace_memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 30 }).default('MEMBER').notNull(), // 'ADMIN' | 'MODERATOR' | 'MEMBER'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

```

### 3.2. Ontological Metamodel Schema (`meta.ts`)

```typescript
import { pgSchema, uuid, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { workspaces } from './auth';

export const metaSchema = pgSchema('meta');

export const ontologyClasses = metaSchema.table('ontology_classes', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  systemKey: varchar('system_key', { length: 100 }).notNull(),
  displayNames: jsonb('display_names').notNull(), // { "es": "Problema", "en": "Problem" }
  descriptions: jsonb('descriptions').default({}),
  parentClassKey: varchar('parent_class_key', { length: 100 }),
  status: varchar('status', { length: 20 }).default('PROPOSED').notNull(),
  proposedBy: varchar('proposed_by', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

```

### 3.3. Graph, Edges and Proposals Schema (`public.ts`)

```typescript
import { pgTable, uuid, varchar, text, jsonb, integer, timestamp, customType } from 'drizzle-orm/pg-core';
import { workspaces } from './auth';

// Custom type for a 768-dimensional vector (pgvector)
const vector768 = customType<{ data: number[] }>({
  dataType() {
    return 'vector(768)';
  },
});

export const nodes = pgTable('nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  typeKey: varchar('type_key', { length: 100 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  attributes: jsonb('attributes').default({}),
  embedding: vector768('embedding'),
  authorHash: varchar('author_hash', { length: 64 }).notNull(),
  status: varchar('status', { length: 20 }).default('PENDING').notNull(), // DRAFT | PENDING | ACTIVE | REJECTED
  communityScore: integer('community_score').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }), // Soft-Delete
});

export const edges = pgTable('edges', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  sourceNodeId: uuid('source_node_id').notNull().references(() => nodes.id, { onDelete: 'cascade' }),
  targetNodeId: uuid('target_node_id').notNull().references(() => nodes.id, { onDelete: 'cascade' }),
  relationKey: varchar('relation_key', { length: 100 }).notNull(),
  status: varchar('status', { length: 20 }).default('PENDING').notNull(), // DRAFT | PENDING | ACTIVE | REJECTED
  communityScore: integer('community_score').default(0).notNull(),
  authorHash: varchar('author_hash', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }), // Soft-Delete
});

export const editProposals = pgTable('edit_proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  targetId: uuid('target_id').notNull(), // Logically points to Node, Edge or Ontology Class
  targetType: varchar('target_type', { length: 30 }).notNull(), // 'NODE' | 'EDGE' | 'ONTOLOGY'
  proposerHash: varchar('proposer_hash', { length: 64 }).notNull(),
  proposedChanges: jsonb('proposed_changes').notNull(),
  justification: text('justification'),
  communityScore: integer('community_score').default(0).notNull(),
  status: varchar('status', { length: 30 }).default('PENDING').notNull(), // 'PENDING' | 'APPROVED' | 'REJECTED'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

```

---

## 4. Apache AGE Integration (LPG Graph in Postgres)

The structural relationships of the graph are reflected in Apache AGE by executing native Cypher statements encapsulated in adapters:

```sql
-- Graph Initialization Script in Apache AGE (per Tenant DB)
CREATE EXTENSION IF NOT EXISTS "age";
SET search_path = ag_catalog, "$user", public;

-- Initialization of the Tenant's Unified Graph
SELECT ag_catalog.create_graph('vozlab_graph');

-- Creation of Labels for Nodes and Edges
SELECT ag_catalog.create_vlabel('vozlab_graph', 'Node');
SELECT ag_catalog.create_elabel('vozlab_graph', 'RELATED_TO');
SELECT ag_catalog.create_elabel('vozlab_graph', 'MERGED_INTO');
SELECT ag_catalog.create_elabel('vozlab_graph', 'CAUSES');

```

> **Decision (recorded TASK-29):** the read path uses the **bounded SQL recursive CTE** over
> `public.edges` (workspace-scoped, `depth ≤ 3`, per-depth `LIMIT`), **not** Apache AGE/Cypher.
> The graph itself and its labels are created per tenant DB
> (`packages/database/scripts/02-extensions-and-graph.sql`), but nothing mirrors `public.nodes`
> / `public.edges` into `vozlab_graph` today and no adapter issues Cypher. **Apache AGE/Cypher is
> deferred to its own milestone** (mirroring + reconciliation + Cypher adapter): it requires
> dual-write on every node/edge mutation and a backfill of existing rows, and is not needed for
> the bounded subgraph view (NFR-01). Until that milestone, do not add AGE writes or a Cypher
> adapter piecewise.

---

## 5. Vote Scoring: Synchronous Atomic DB Increment (Decision)

**Decision (recorded TASK-27):** vote scoring is implemented as a **synchronous,
atomic DB increment** inside the same UnitOfWork transaction as the interaction
insert, as required by `FR-15` / `US-04 AC#2`. `CastVoteUseCase` derives the
delta from `interactionType` via the domain value object
`domain/value_objects/VoteValue.ts` (`DOWNVOTE -> -1`,
`UPVOTE | SUPPORT | VALIDATE -> +1`), and `DrizzleInteractionRepository.applyScoreDelta`
performs an O(1) `sql`-level `+=` on the target's denormalized counters:
`community_score` for `NODE`/`EDGE`/`PROPOSAL`, and the
`upvotes`/`downvotes`/`community_score` trio for `POST`.

The previously drafted Redis-buffered CQRS scheme (`HINCRBY vozlab:scores:{id}`
plus a periodic 60 s flush) is **deferred**: it is tracked as a future milestone
in `EXECUTION_PLAN.md` and must not be implemented piecewise. Until then, the
counters are read directly from PostgreSQL and are strongly consistent with the
interactions log.

---

## 6. High-Performance Indexes and Vector Search (HNSW)

```sql
-- HNSW Vector Indexing (pgvector) using Cosine Similarity
CREATE INDEX idx_nodes_embedding_hnsw 
ON public.nodes 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- B-Tree Indexes for Filtering by Workspace and Status (Skipping soft-deletes)
CREATE INDEX idx_nodes_workspace_status 
ON public.nodes (workspace_id, status) 
WHERE deleted_at IS NULL;

CREATE INDEX idx_edges_workspace_status 
ON public.edges (workspace_id, status) 
WHERE deleted_at IS NULL;

-- GIN Index for Dynamic JSONB Attributes
CREATE INDEX idx_nodes_attributes_gin 
ON public.nodes USING gin (attributes);

```

---

## 4. Implementation Status — MILESTONE-0.4 (Migrations with drizzle-kit) ✅

> Date: 2026-10-15 · Validated by running `pnpm --filter @vozlab/database db:generate`

### 4.1. Two configurations (one per database)

Since the design is of **two physical databases**, there are **two** drizzle-kit configuration files
(never a single config, to prevent router and tenant tables from being mixed):

| Config | `schema` | `out` |
| --- | --- | --- |
| `drizzle.router.config.ts` | `src/schema/router.schema.ts` | `migrations/router/` |
| `drizzle.tenant.config.ts` | `src/schema/tenant.*.schema.ts` | `migrations/tenant/` |

### 4.2. Commands

```bash
pnpm --filter @vozlab/database db:generate        # generates both migrations
pnpm --filter @vozlab/database db:generate:router # only the router
pnpm --filter @vozlab/database db:generate:tenant # only the tenant
pnpm --filter @vozlab/database db:migrate[:router|:tenant]
pnpm --filter @vozlab/database db:push[:router|:tenant]
```

### 4.3. Fixes required for `drizzle-kit` to work

1. **Incompatible pins**: the project had `drizzle-orm ^0.33.0` with `drizzle-kit ^0.25.0`.
   drizzle-kit 0.25.x imports `drizzle-orm/casing`, which only exists starting from
   `drizzle-orm@0.34.0`. It was aligned to the canonical pair published the same day:
   **`drizzle-orm ^0.34.0`** + **`drizzle-kit ^0.25.0`** (in `packages/database` and `apps/api`,
   to keep a single instance of the ORM).
2. **`.js` → `.ts` resolution**: with `moduleResolution: NodeNext` internal imports use the
   `.js` extension, which the drizzle-kit loader (`esbuild-register`) does not rewrite. The
   **`tsx`** loader is registered in the scripts (`NODE_OPTIONS='--import tsx'`), which resolves
   `.js`→`.ts` without touching the code imports or the `tsconfig`.

### 4.4. Verified acceptance criteria

- [x] The node schema includes `vector(768)` → `migrations/tenant/0000_*.sql` contains it.
- [x] No Router↔Tenant cross-dependencies → the router migration does not contain tenant tables and vice versa.
- [x] `drizzle-kit generate` runs successfully for both databases.

### 4.5. Postgres Image (MILESTONE-0.2) — resolved

`postgres:16-alpine` (which did not include `age` or `pgvector`) was replaced by a **custom image**
in `docker/postgres/Dockerfile`: `FROM apache/age:release_PG18_1.8.0` + `postgresql-18-pgvector`
from the PGDG repo. Result: **PostgreSQL 18.6 + Apache AGE 1.8 + pgvector** (~175 MB),
without compiling AGE (the official Apache binary is used).

The startup scripts (`packages/database/scripts/`) create the databases
(`01-create-databases.sql`) and enable the extensions per database + `create_graph('vozlab_graph')`
with its labels (`02-extensions-and-graph.sql`).

### 4.6. Schema completeness (audit 2026-10-15)

The migration `migrations/tenant/0001_*.sql` adds what was missing relative to the FRs:

| Added | FR |
| --- | --- |
| `meta.datatype_properties` (class attributes) | FR-06, FR-09 |
| `meta.object_properties` (relations with domain/range) | FR-08, FR-09 |
| `social.discussion_threads`, `social.discussion_posts` (hierarchical) | FR-11, FR-16 |
| `public.interactions_log` (UNIQUE `unique_user_target_vote`) | FR-14 |
| HNSW, GIN and partial B-tree indexes | NFR-01, NFR-02 |
