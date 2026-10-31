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
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

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
 * Thin credential routing (ADR-0046, DEC-3).
 *
 * A pre-tenant credential (event QR today, external invitation later) is
 * presented BEFORE the API knows which tenant owns it. This table is the
 * L0 directory that answers "which institution?" — nothing more. It holds
 * no capacity, no expiry, no workspace and no creator: the credential's
 * AUTHORITY lives in the tenant's `auth.workspace_join_codes` (purpose
 * discriminator, ADR-0046). A stale route is inert (routing is not
 * authority); a missing route simply 404s until the operator re-pushes.
 *
 * This is the ADR-0002 exception — a pure mapping row, the same kind of row
 * `tenants.oidc_tenant_id` already is, replacing the ADR-0019 registry
 * which crossed the L0 boundary by carrying credential state.
 */
export const credentialRoutes = pgTable(
  'credential_routes',
  {
    /** SHA-256 of the raw credential; the raw value never reaches the router. */
    credentialHash: varchar('credential_hash', { length: 64 }).notNull().unique(),
    /** Which credential class the hash belongs to. */
    kind: varchar('kind', { length: 12 }).notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      'credential_routes_kind_check',
      sql`${table.kind} IN ('EVENT', 'INVITATION')`
    ),
  ],
);

export type CredentialRoute = typeof credentialRoutes.$inferSelect;
export type NewCredentialRoute = typeof credentialRoutes.$inferInsert;

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
 * Global user index (D6, M2a) — the router DB is the cross-tenant identity
 * vault: one row per unique (issuer, subject) pair across all institutions.
 *
 * Since v5/v6 this row carries the identity profile as the single source of
 * truth for "who is this user", and the IdP `subject` is stored RAW (not
 * hashed). Workspace/role data remain in the tenant DB.
 *
 * DEC-4/DEC-5 D5: the vault stores the **hash** of the verified email —
 * `HMAC-SHA-256(lower(trim(email)), EMAIL_PEPPER)` — never the cleartext.
 * Cross-IdP linking and invitation redemption compare hashes of the email
 * the IdP just asserted; nothing in the platform can display or contact by
 * email from the DB. No cleartext email lives in any table.
 */
export const globalUsers = pgTable(
  'global_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issuer: varchar('issuer', { length: 512 }).notNull(),
    subject: varchar('subject', { length: 255 }).notNull(),
    // v5: identity profile stored in router DB as the single source
    // of truth for "who is this user". Workspace/role data remain in tenant DB.
    emailHash: varchar('email_hash', { length: 64 }),
    emailVerified: boolean('email_verified').default(false).notNull(),
    fullName: varchar('full_name', { length: 255 }),
    picture: varchar('picture', { length: 1024 }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uniq_global_users_issuer_subject').on(table.issuer, table.subject),
    // Linking lookup key (DEC-4/DEC-5 D5): hash of the verified email the IdP
    // asserted. Non-unique — the three pre-fold vault rows carry NULL.
    index('idx_global_users_email_hash').on(table.emailHash),
  ]
);

export type GlobalUser = typeof globalUsers.$inferSelect;
export type NewGlobalUser = typeof globalUsers.$inferInsert;

/**
 * Global user ↔ tenant link (D7, M2b).
 *
 * Links a global user to a tenant user. No FK between DBs (router
 * and tenant are separate physical databases).
 */
export const globalUserTenants = pgTable(
  'global_user_tenants',
  {
    globalUserId: uuid('global_user_id')
      .notNull()
      .references(() => globalUsers.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    tenantUserId: uuid('tenant_user_id').notNull(),
    status: varchar('status', { length: 20 }).default('ACTIVE').notNull(), // 'ACTIVE' | 'SUSPENDED' | 'LEFT'
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uniq_global_user_tenant').on(table.globalUserId, table.tenantId),
    uniqueIndex('uniq_tenant_user').on(table.tenantId, table.tenantUserId),
  ]
);

export type GlobalUserTenant = typeof globalUserTenants.$inferSelect;
export type NewGlobalUserTenant = typeof globalUserTenants.$inferInsert;

/**
 * Global user audit events (D11, append-only, router DB).
 *
 * Convention: IDs, roles and states only — but `metadata` is free-form JSON
 * the writers control, so the shape is NOT enforced by the schema. Writers
 * must not put PII in it (the router is the PII vault; this table is its
 * action log).
 */
export const globalUserEvents = pgTable(
  'global_user_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    globalUserId: uuid('global_user_id').notNull(),
    tenantId: uuid('tenant_id'),
    actorType: varchar('actor_type', { length: 30 }).notNull(),
    actorId: varchar('actor_id', { length: 255 }),
    action: varchar('action', { length: 50 }).notNull(),
    metadata: text('metadata'), // JSON string
    requestId: varchar('request_id', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_global_user_events_identity').on(table.globalUserId),
    index('idx_global_user_events_tenant').on(table.tenantId),
    index('idx_global_user_events_created').on(table.createdAt),
  ]
);

// DEC-9 (2026-10-30, identity-consolidation T6): `global_invitations` is
// RETIRED here. An invitation is a tenant `auth.invitations` row — the same
// mechanism as every other invitation — routed pre-tenant by its
// `credential_routes` row of kind 'INVITATION'. The router keeps no
// invitation state (routing is never authority, ADR-0045/ADR-0046).

export type GlobalUserEvent = typeof globalUserEvents.$inferSelect;
export type NewGlobalUserEvent = typeof globalUserEvents.$inferInsert;