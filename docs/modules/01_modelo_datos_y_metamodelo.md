---
title: "Especificación de Módulo: Modelo de Datos, Drizzle ORM y Apache AGE"
version: 1.0.0
status: APPROVED
target_component: Database Layer (PostgreSQL)
owner: Database & Backend Team (VozLab)
---

# 01. MODELO DE DATOS, METAMODELO Y PERSISTENCIA (VOZLAB)

## 1. Topología del Motor de Persistencia (PostgreSQL 16+)

VozLab utiliza **PostgreSQL 16+** como motor de persistencia unificado, integrando tres paradigmas sobre la misma instancia para evitar desincronizaciones de estado:

1. **Relacional y Documental (Drizzle ORM + JSONB):** Manejo de esquemas `auth`, `meta`, `public` y `social`.
2. **Grafo LPG (Apache AGE):** Navegación Cypher nativa para trazados ontológicos y relaciones entre nodos.
3. **Búsqueda Vectorial (`pgvector`):** Vectores de 768 dimensiones con índice HNSW para búsqueda por similitud coseno.

---

## 2. Definición de Esquemas en Drizzle ORM (`packages/database/src/schema/`)

### 2.1. Esquema de Identidad y Workspaces (`auth.ts`)

```typescript
import { pgSchema, uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';

export const authSchema = pgSchema('auth');

export const tenants = authSchema.table('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  oidcTenantId: varchar('oidc_tenant_id', { length: 255 }).notNull().unique(),
  databaseConnectionKey: varchar('database_connection_key', { length: 255 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

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

```

### 2.2. Esquema de Metamodelo Ontológico (`meta.ts`)

```typescript
import { pgSchema, uuid, varchar, jsonb, integer, timestamp } from 'drizzle-orm/pg-core';
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

### 2.3. Esquema del Grafo y Votos (`public.ts`)

```typescript
import { pgTable, uuid, varchar, text, jsonb, integer, timestamp, customType } from 'drizzle-orm/pg-core';
import { workspaces } from './auth';

// Tipo personalizado para vector de 768 dimensiones
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
  status: varchar('status', { length: 20 }).default('ACTIVE').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const editProposals = pgTable('edit_proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  targetId: uuid('target_id').notNull(),
  targetType: varchar('target_type', { length: 30 }).notNull(), // 'NODE' | 'EDGE' | 'ONTOLOGY'
  proposerHash: varchar('proposer_hash', { length: 64 }).notNull(),
  proposedChanges: jsonb('proposed_changes').notNull(),
  justification: text('justification'),
  communityScore: integer('community_score').default(0).notNull(),
  status: varchar('status', { length: 30 }).default('PENDING').notNull(), // 'PENDING' | 'APPROVED_BY_AUTHOR' | 'REJECTED_BY_AUTHOR' | 'AUTO_APPLIED'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

```

---

## 3. Integración de Apache AGE (Grafo LPG en Postgres)

Las relaciones estructurales del grafo se reflejan en Apache AGE mediante la ejecución de sentencias Cypher nativas encapsuladas en adaptadores de Drizzle:

```sql
-- Script de Inicialización del Grafo en Apache AGE
CREATE EXTENSION IF NOT EXISTS "age";
SET search_path = ag_catalog, "$user", public;

-- Inicialización del Grafo Unificado
SELECT ag_catalog.create_graph('vozlab_graph');

-- Creación de Etiquetas (Labels) para Nodos y Aristas
SELECT ag_catalog.create_vlabel('vozlab_graph', 'Node');
SELECT ag_catalog.create_elabel('vozlab_graph', 'RELATED_TO');
SELECT ag_catalog.create_elabel('vozlab_graph', 'MERGED_INTO');
SELECT ag_catalog.create_elabel('vozlab_graph', 'CAUSES');

```

---

## 4. Índices de Alto Rendimiento y Búsqueda Vectorial (HNSW)

Para cumplir con los tiempos de respuesta exigidos ($p_{95} < 20\text{ ms}$ en vectores y $p_{95} < 30\text{ ms}$ en subgrafos):

```sql
-- Indexación Vectorial HNSW (pgvector) usando Similitud Coseno
CREATE INDEX idx_nodes_embedding_hnsw 
ON public.nodes 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Índices B-Tree para Aislamiento Multi-Tenant Acelerado
CREATE INDEX idx_nodes_workspace_tenant 
ON public.nodes (workspace_id, status);

CREATE INDEX idx_proposals_target_status 
ON public.edit_proposals (target_id, status);

-- Índice GIN para Atributos Dinámicos JSONB
CREATE INDEX idx_nodes_attributes_gin 
ON public.nodes USING gin (attributes);

```

---

## 5. Reglas de Validación y Constraints Multi-Tenant

> [!CAUTION]
> **Integridad Referencial de Workspace:** Todo registro insertado en `public.nodes`, `public.edit_proposals` o `social.discussion_threads` debe validar la existencia activa del `workspace_id` en `auth.workspaces`.

```sql
-- Trigger para actualización automática de timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN    NEW.updated_at = NOW();    RETURN NEW; END; $$ language 'plpgsql';

CREATE TRIGGER update_nodes_updated_at
BEFORE UPDATE ON public.nodes
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();

```
