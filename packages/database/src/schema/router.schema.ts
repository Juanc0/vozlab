import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Router schema: global tenant registry.
 * This schema lives in the central router database (vozlab_router),
 * separate from any tenant's physical database.
 */
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  oidcTenantId: varchar('oidc_tenant_id', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  provisioned: boolean('provisioned').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

/**
 * Global event-code registry (FR-03).
 *
 * Explicit exception to the "router DB only holds tenants and connections"
 * rule (ADR-0002): event codes are looked up before the tenant is known, so a
 * single global registry is the only way to resolve a scanned QR without
 * putting the tenant slug in the URL. The row points at a workspace inside the
 * tenant's physical DB; there is deliberately no cross-DB foreign key.
 */
export const eventCodes = pgTable(
  'event_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').notNull(),
    /** SHA-256 of the raw code; the raw value is only printed at creation. */
    codeHash: varchar('code_hash', { length: 64 }).notNull().unique(),
    label: varchar('label', { length: 255 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** `null` means unlimited joins. */
    maxUses: integer('max_uses'),
    usedCount: integer('used_count').default(0).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /** Pseudonym of the creator; the user lives in a tenant DB. */
    createdByHash: varchar('created_by_hash', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_event_codes_tenant_workspace').on(table.tenantId, table.workspaceId),
    index('idx_event_codes_expires_at').on(table.expiresAt),
  ],
);

export type EventCode = typeof eventCodes.$inferSelect;
export type NewEventCode = typeof eventCodes.$inferInsert;

/**
 * Physical connection configuration for each tenant's database.
 * Credentials are encrypted at rest in production; here stored as text
 * for local development.
 */
export const tenantConnections = pgTable('tenant_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  host: varchar('host', { length: 255 }).notNull(),
  port: integer('port').default(5432).notNull(),
  database: varchar('database', { length: 100 }).notNull(),
  user: varchar('user', { length: 100 }).notNull(),
  password: text('password').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type TenantConnection = typeof tenantConnections.$inferSelect;
export type NewTenantConnection = typeof tenantConnections.$inferInsert;

/**
 * Identity providers configured per tenant (D1).
 *
 * Each row describes an IdP that a tenant uses for institutional login.
 * The `issuer` is matched against the `iss` claim of the IdP's tokens.
 * `client_id` and `metadata_url` are used by the broker (Keycloak/Zitadel)
 * to federate the provider.
 */
export const tenantIdentityProviders = pgTable(
  'tenant_identity_providers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    providerKind: varchar('provider_kind', { length: 30 }).notNull(), // 'OIDC_INSTITUTIONAL' | 'OIDC_SOCIAL' | 'SAML' | 'LDAP'
    issuer: varchar('issuer', { length: 512 }).notNull(),
    clientId: varchar('client_id', { length: 255 }),
    metadataUrl: varchar('metadata_url', { length: 1024 }),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_tenant_idp_tenant').on(table.tenantId),
    index('idx_tenant_idp_issuer').on(table.issuer),
  ]
);

export type TenantIdentityProvider = typeof tenantIdentityProviders.$inferSelect;
export type NewTenantIdentityProvider = typeof tenantIdentityProviders.$inferInsert;

/**
 * Global identity index (D6, M2a).
 *
 * Maps (issuer, subject) → global_identity_id in the router DB.
 * Contains NO PII (no email, name, role). Only the IdP subject hash.
 * One row per unique (issuer, subject) pair across all institutions.
 */
export const globalIdentities = pgTable(
  'global_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issuer: varchar('issuer', { length: 512 }).notNull(),
    subject: varchar('subject', { length: 255 }).notNull(),
    // v5: identity profile (PII) stored in router DB as the single source
    // of truth for "who is this user". Workspace/role data remain in tenant DB.
    email: varchar('email', { length: 255 }),
    emailVerified: boolean('email_verified').default(false).notNull(),
    fullName: varchar('full_name', { length: 255 }),
    picture: varchar('picture', { length: 1024 }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uniq_global_identities_issuer_subject').on(table.issuer, table.subject),
  ]
);

export type GlobalIdentity = typeof globalIdentities.$inferSelect;
export type NewGlobalIdentity = typeof globalIdentities.$inferInsert;

/**
 * Global identity ↔ tenant link (D7, M2b).
 *
 * Links a global identity to a tenant user. No FK between DBs (router
 * and tenant are separate physical databases).
 */
export const globalIdentityTenants = pgTable(
  'global_identity_tenants',
  {
    globalIdentityId: uuid('global_identity_id')
      .notNull()
      .references(() => globalIdentities.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    tenantUserId: uuid('tenant_user_id').notNull(),
    status: varchar('status', { length: 20 }).default('ACTIVE').notNull(), // 'ACTIVE' | 'SUSPENDED' | 'LEFT'
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uniq_global_identity_tenant').on(table.globalIdentityId, table.tenantId),
    uniqueIndex('uniq_tenant_user').on(table.tenantId, table.tenantUserId),
  ]
);

export type GlobalIdentityTenant = typeof globalIdentityTenants.$inferSelect;
export type NewGlobalIdentityTenant = typeof globalIdentityTenants.$inferInsert;

/**
 * Global identity audit events (D11, append-only, router DB).
 *
 * No PII: only IDs, roles and states.
 */
export const globalIdentityEvents = pgTable(
  'global_identity_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    globalIdentityId: uuid('global_identity_id').notNull(),
    tenantId: uuid('tenant_id'),
    actorType: varchar('actor_type', { length: 30 }).notNull(),
    actorId: varchar('actor_id', { length: 255 }),
    action: varchar('action', { length: 50 }).notNull(),
    metadata: text('metadata'), // JSON string
    requestId: varchar('request_id', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_global_identity_events_identity').on(table.globalIdentityId),
    index('idx_global_identity_events_tenant').on(table.tenantId),
    index('idx_global_identity_events_created').on(table.createdAt),
  ]
);

export const globalInvitations = pgTable(
  'global_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').notNull(),
    role: varchar('role', { length: 30 }).default('MEMBER').notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).default('PENDING').notNull(),
    maxUses: integer('max_uses'),
    usedCount: integer('used_count').default(0).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_global_invitations_tenant').on(table.tenantId),
    index('idx_global_invitations_email').on(table.email),
  ]
);

export type GlobalInvitation = typeof globalInvitations.$inferSelect;
export type NewGlobalInvitation = typeof globalInvitations.$inferInsert;

export type GlobalIdentityEvent = typeof globalIdentityEvents.$inferSelect;
export type NewGlobalIdentityEvent = typeof globalIdentityEvents.$inferInsert;