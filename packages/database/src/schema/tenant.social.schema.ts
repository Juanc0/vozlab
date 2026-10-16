import {
  pgSchema,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { workspaces } from './tenant.auth.schema.js';

/**
 * Social schema: governance discussions and threaded comments (RF-11, RF-16).
 * This schema resides in the institution's physical database.
 *
 *   discussion_threads -> a debate thread attached to any governance target
 *   discussion_posts   -> hierarchical (self-referencing) comments with
 *                         per-comment voting
 */
export const socialSchema = pgSchema('social');

export const discussionThreads = socialSchema.table(
  'discussion_threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    // Polymorphic target: the node, edge or proposal being debated.
    targetId: uuid('target_id').notNull(),
    targetType: varchar('target_type', { length: 30 }).notNull(), // NODE | EDGE | PROPOSAL | ONTOLOGY
    title: varchar('title', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).default('OPEN').notNull(), // OPEN | CLOSED
    createdByHash: varchar('created_by_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_discussion_threads_target').on(
      table.targetId,
      table.targetType
    ),
    index('idx_discussion_threads_workspace').on(
      table.workspaceId,
      table.status
    ),
  ]
);

export const discussionPosts = socialSchema.table(
  'discussion_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => discussionThreads.id, { onDelete: 'cascade' }),
    // Self-reference enables nested replies (RF-16).
    parentPostId: uuid('parent_post_id'),
    authorHash: varchar('author_hash', { length: 64 }).notNull(),
    body: text('body').notNull(),
    // Denormalized counters, updated atomically (RF-15).
    upvotes: integer('upvotes').default(0).notNull(),
    downvotes: integer('downvotes').default(0).notNull(),
    communityScore: integer('community_score').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }), // Soft-Delete
  },
  (table) => [
    index('idx_discussion_posts_thread').on(
      table.threadId,
      table.createdAt
    ),
    index('idx_discussion_posts_parent').on(table.parentPostId),
  ]
);

export type DiscussionThread = typeof discussionThreads.$inferSelect;
export type DiscussionPost = typeof discussionPosts.$inferSelect;
