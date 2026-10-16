import { pgSchema, uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';

/**
 * Auth schema: identity and workspaces.
 * This schema resides in the institution's physical database.
 */
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
  systemRole: varchar('system_role', { length: 30 }).default('USER').notNull(), // 'USER' | 'ADMIN' | 'MODERATOR' | 'SYSTEM_AGENT'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const workspaceMemberships = authSchema.table('workspace_memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 30 }).default('MEMBER').notNull(), // 'ADMIN' | 'MODERATOR' | 'MEMBER'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type User = typeof users.$inferSelect;
export type WorkspaceMembership = typeof workspaceMemberships.$inferSelect;