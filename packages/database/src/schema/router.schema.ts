import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Router schema: global tenant registry.
 * This schema lives in the central router database (vozlab_router),
 * separate from any tenant's physical database.
 */
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  oidcTenantId: varchar('oidc_tenant_id', { length: 255 }).notNull().unique(),
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