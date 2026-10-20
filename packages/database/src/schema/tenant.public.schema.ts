import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  timestamp,
  customType,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './tenant.auth.schema.js';

// Custom type for 768D vector (pgvector).
// `toDriver` renders the JS array as a pgvector literal (`[0.1,0.2]`) and
// `fromDriver` parses the text form PostgreSQL returns, so the column is
// always sent/received in the format the extension understands.
const vector768 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(768)';
  },
  fromDriver(value: string | null): number[] {
    if (!value) return [];
    const trimmed = value.trim().replace(/^\[/, '').replace(/\]$/, '');
    if (!trimmed) return [];
    return trimmed.split(',').map((part) => Number(part));
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
});

/**
 * Public schema: core graph data (LPG nodes and edges) + governance records.
 * This resides in the institution's physical database.
 */

export const nodes = pgTable(
  'nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    typeKey: varchar('type_key', { length: 100 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    attributes: jsonb('attributes').default({}),
    embedding: vector768('embedding'),
    // ADR-0020: a vector is only meaningful for the model that produced it,
    // so the model and the write time are stored next to it. Both stay NULL
    // until an embedding is written.
    embeddingModel: text('embedding_model'),
    embeddedAt: timestamp('embedded_at', { withTimezone: true }),
    authorHash: varchar('author_hash', { length: 64 }).notNull(),
    status: varchar('status', { length: 20 }).default('PENDING').notNull(), // DRAFT | PENDING | ACTIVE | MERGED | DEPRECATED | REJECTED
    // ADR-0026: the node that survives when this node is merged away.
    // NULL for every node that was never merged. The pointer is kept when the
    // survivor is hard-deleted (the rows only leave the table with the
    // workspace).
    mergedIntoId: uuid('merged_into_id').references((): AnyPgColumn => nodes.id, {
      onDelete: 'set null',
    }),
    communityScore: integer('community_score').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }), // Soft-Delete
  },
  (table) => [
    // RNF-02: HNSW index for cosine similarity search over embeddings.
    index('idx_nodes_embedding_hnsw')
      .using('hnsw', table.embedding.op('vector_cosine_ops'))
      .with({ m: 16, ef_construction: 64 }),
    // RNF-01: workspace/status lookups excluding soft-deleted rows.
    index('idx_nodes_workspace_status')
      .on(table.workspaceId, table.status)
      .where(sql`${table.deletedAt} IS NULL`),
    // Dynamic JSONB attribute filtering.
    index('idx_nodes_attributes_gin').using('gin', table.attributes),
  ]
);

export const edges = pgTable(
  'edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    sourceNodeId: uuid('source_node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    targetNodeId: uuid('target_node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    relationKey: varchar('relation_key', { length: 100 }).notNull(),
    attributes: jsonb('attributes').default({}),
    status: varchar('status', { length: 20 }).default('PENDING').notNull(), // DRAFT | PENDING | ACTIVE | REJECTED
    communityScore: integer('community_score').default(0).notNull(),
    authorHash: varchar('author_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }), // Soft-Delete
  },
  (table) => [
    index('idx_edges_workspace_status')
      .on(table.workspaceId, table.status)
      .where(sql`${table.deletedAt} IS NULL`),
    // NFR-01: workspace-covering partial indexes for the subgraph traversal.
    // `workspace_id` leads so the recursive CTE's workspace filter is
    // index-covered; `deleted_at IS NULL` matches the partial predicate.
    index('idx_edges_workspace_source')
      .on(table.workspaceId, table.sourceNodeId)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_edges_workspace_target')
      .on(table.workspaceId, table.targetNodeId)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

export const editProposals = pgTable('edit_proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  targetId: uuid('target_id').notNull(), // Logically points to Node, Edge, or Ontology Class
  targetType: varchar('target_type', { length: 30 }).notNull(), // 'NODE' | 'EDGE' | 'ONTOLOGY'
  // ADR-0026: the kind of the proposal. 'EDIT' is an attribute delta applied
  // to the target; 'MERGE' folds the target node into another one.
  kind: varchar('kind', { length: 20 }).default('EDIT').notNull(),
  proposerHash: varchar('proposer_hash', { length: 64 }).notNull(),
  proposedChanges: jsonb('proposed_changes').notNull(),
  justification: text('justification'),
  communityScore: integer('community_score').default(0).notNull(),
  status: varchar('status', { length: 30 }).default('PENDING').notNull(), // 'PENDING' | 'APPROVED_BY_AUTHOR' | 'REJECTED_BY_AUTHOR' | 'AUTO_APPLIED'
  resolvedBy: varchar('resolved_by', { length: 64 }), // author_hash of the resolver (author or moderator)
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * Interactions log: immutable record of every community action (RF-14).
 * The unique constraint guarantees a single active vote per user/target,
 * and counters elsewhere are updated atomically (RF-15).
 */
export const interactionsLog = pgTable(
  'interactions_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userHash: varchar('user_hash', { length: 64 }).notNull(),
    targetId: uuid('target_id').notNull(),
    targetType: varchar('target_type', { length: 30 }).notNull(), // NODE | EDGE | PROPOSAL | POST
    interactionType: varchar('interaction_type', { length: 20 }).notNull(), // UPVOTE | DOWNVOTE | SUPPORT | VALIDATE
    value: integer('value').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('unique_user_target_vote').on(
      table.userHash,
      table.targetId,
      table.targetType
    ),
    index('idx_interactions_target').on(table.targetId, table.targetType),
  ]
);

export type Node = typeof nodes.$inferSelect;
export type Edge = typeof edges.$inferSelect;
export type EditProposal = typeof editProposals.$inferSelect;
export type InteractionLogRow = typeof interactionsLog.$inferSelect;
