import {
  pgSchema,
  uuid,
  varchar,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

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

export const users = authSchema.table(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).unique(),
    fullName: varchar('full_name', { length: 255 }),
    provider: varchar('provider', { length: 50 }).notNull(), // 'OIDC_INSTITUTIONAL' | 'ANONYMOUS_EVENT'
    providerUserId: varchar('provider_user_id', { length: 255 }),
    authorHash: varchar('author_hash', { length: 64 }).notNull().unique(),
    anonymousAlias: varchar('anonymous_alias', { length: 100 }),
    systemRole: varchar('system_role', { length: 30 }).default('USER').notNull(), // 'USER' | 'ADMIN' | 'MODERATOR' | 'SYSTEM_AGENT'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // One account per IdP subject; prevents duplicate JIT rows under
    // concurrent callbacks. NULL provider_user_id is allowed for event users.
    uniqueIndex('uniq_users_provider_provider_user').on(
      table.provider,
      table.providerUserId
    ),
  ]
);

export const workspaceMemberships = authSchema.table(
  'workspace_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 30 }).default('MEMBER').notNull(), // 'ADMIN' | 'MODERATOR' | 'MEMBER'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // One membership per user/workspace; the scheduler never has to choose
    // between duplicate rows.
    uniqueIndex('uniq_memberships_workspace_user').on(
      table.workspaceId,
      table.userId
    ),
  ]
);

/**
 * Rotating refresh sessions (ADR-0018).
 *
 * Only the SHA-256 hash is stored: a database leak does not hand out usable
 * refresh tokens. Rotating a token revokes the old row and inserts a new one in
 * the same `family_id`; presenting an already-revoked token is treated as theft
 * and revokes the whole family.
 */
export const refreshTokens = authSchema.table(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_refresh_tokens_user').on(table.userId),
    index('idx_refresh_tokens_family').on(table.familyId),
    index('idx_refresh_tokens_expires_at').on(table.expiresAt),
  ]
);

export type Workspace = typeof workspaces.$inferSelect;
export type User = typeof users.$inferSelect;
export type WorkspaceMembership = typeof workspaceMemberships.$inferSelect;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;