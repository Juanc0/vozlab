import {
  pgSchema,
  uuid,
  varchar,
  boolean,
  timestamp,
  integer,
  text,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

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
  kind: varchar('kind', { length: 20 }).default('PRIVATE').notNull(),
  /**
   * Routing hint for private workspaces (US-00). It identifies the workspace
   * but grants nothing: a valid code only lets an authenticated tenant user
   * create a join request that an admin still has to approve.
   */
  joinCode: varchar('join_code', { length: 24 }).notNull().unique(),
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
    isAnonymous: boolean('is_anonymous').default(false).notNull(),
    systemRole: varchar('system_role', { length: 30 }).default('USER').notNull(), // 'USER' | 'ADMIN' | 'MODERATOR' | 'SYSTEM_AGENT'
    sessionsValidAfter: timestamp('sessions_valid_after', { withTimezone: true }),
    globalIdentityId: uuid('global_identity_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Partial unique index: only one local user per global identity.
    uniqueIndex('uniq_users_global_identity')
      .on(table.globalIdentityId)
      .where(sql`global_identity_id IS NOT NULL`),
    // One account per IdP subject; prevents duplicate JIT rows under
    // concurrent callbacks. NULL provider_user_id is allowed for event users.
    uniqueIndex('uniq_users_provider_provider_user').on(
      table.provider,
      table.providerUserId
    ),
  ]
);

/**
 * Membership audit events (D11, append-only).
 *
 * Only INSERT is allowed (no UPDATE, no DELETE). Enforced at DB level
 * via revoke of UPDATE/DELETE grants in production. For dev, the app
 * only ever inserts.
 */
export const membershipEvents = authSchema.table(
  'membership_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    userId: uuid('user_id'), // nullable (INVITED has no user yet)
    invitationId: uuid('invitation_id'),
    actorType: varchar('actor_type', { length: 30 }).notNull(), // 'USER' | 'ADMIN' | 'SYSTEM'
    actorId: varchar('actor_id', { length: 255 }),
    action: varchar('action', { length: 50 }).notNull(), // 'INVITED' | 'ACCEPTED' | 'SUSPENDED' | 'REMOVED' | 'ROLE_CHANGED'
    beforeRole: varchar('before_role', { length: 30 }),
    afterRole: varchar('after_role', { length: 30 }),
    reason: text('reason'),
    requestId: varchar('request_id', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_membership_events_workspace').on(table.workspaceId),
    index('idx_membership_events_user').on(table.userId),
    index('idx_membership_events_created').on(table.createdAt),
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
    // v5: a user may hold multiple roles in a workspace simultaneously.
    // Verification uses the union of all roles. One row per (workspace, user, role).
    uniqueIndex('uniq_memberships_workspace_user_role').on(
      table.workspaceId,
      table.userId,
      table.role
    ),
  ]
);

/**
 * Join requests (US-00).
 *
 * A user who is already authenticated in the tenant asks to enter a
 * workspace. The request is a *hint*, never a grant: an active workspace
 * ADMIN (or a tenant ADMIN) has to approve it, and only the approval creates
 * the membership. A workspace code only routes the request to the workspace.
 *
 * The partial unique index allows one PENDING request per user/workspace
 * while keeping the history of the rejected or approved ones.
 */
export const workspaceJoinRequests = authSchema.table(
  'workspace_join_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 }).default('PENDING').notNull(), // 'PENDING' | 'APPROVED' | 'REJECTED'
    message: varchar('message', { length: 500 }),
    decidedBy: uuid('decided_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_join_requests_workspace_status').on(table.workspaceId, table.status),
    index('idx_join_requests_user').on(table.userId),
    uniqueIndex('uniq_join_requests_pending_user_workspace')
      .on(table.workspaceId, table.userId)
      .where(sql`status = 'PENDING'`),
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

export const workspaceJoinCodes = authSchema.table(
  'workspace_join_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    codeHash: varchar('code_hash', { length: 64 }).notNull().unique(),
    label: varchar('label', { length: 255 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    maxUses: integer('max_uses'),
    usedCount: integer('used_count').default(0).notNull(),
    autoApprove: boolean('auto_approve').default(false).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_workspace_join_codes_workspace').on(table.workspaceId)]
);

export type WorkspaceJoinCode = typeof workspaceJoinCodes.$inferSelect;
export type NewWorkspaceJoinCode = typeof workspaceJoinCodes.$inferInsert;

export type Workspace = typeof workspaces.$inferSelect;
export type User = typeof users.$inferSelect;
export type WorkspaceMembership = typeof workspaceMemberships.$inferSelect;
export type WorkspaceJoinRequest = typeof workspaceJoinRequests.$inferSelect;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;