import {
  pgSchema,
  uuid,
  varchar,
  boolean,
  timestamp,
  integer,
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
    sessionsValidAfter: timestamp('sessions_valid_after', { withTimezone: true }),
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

/**
 * External identity mapping (ADR-0028, C3).
 *
 * Stores the (issuer, subject) pair for each OIDC account so that multiple
 * providers can be linked to the same VozLab user. The `users.provider_user_id`
 * column is kept for backward compatibility but new code should use this table.
 */
export const externalIdentities = authSchema.table(
  'external_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    issuer: varchar('issuer', { length: 512 }).notNull(),
    subject: varchar('subject', { length: 255 }).notNull(),
    providerKind: varchar('provider_kind', { length: 50 }).notNull(), // 'OIDC_INSTITUTIONAL' | 'ANONYMOUS_EVENT'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uniq_external_identities_issuer_subject').on(
      table.issuer,
      table.subject
    ),
    index('idx_external_identities_user_id').on(table.userId),
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
    status: varchar('status', { length: 20 }).default('ACTIVE').notNull(), // 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REMOVED'
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
 * Invitations (D3).
 *
 * An admin creates an invitation with a random single-use token. Only the
 * SHA-256 hash is stored; the raw token is returned once. Re-sending
 * generates a new token and rotates the hash.
 */
export const invitations = authSchema.table(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }),
    emailHash: varchar('email_hash', { length: 64 }),
    role: varchar('role', { length: 30 }).default('MEMBER').notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    maxUses: integer('max_uses'),
    usedCount: integer('used_count').default(0).notNull(),
    status: varchar('status', { length: 20 }).default('PENDING').notNull(), // 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: varchar('created_by', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_invitations_workspace').on(table.workspaceId),
    index('idx_invitations_status').on(table.status),
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