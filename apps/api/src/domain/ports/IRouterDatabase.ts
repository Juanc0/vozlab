export interface TenantConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * Port: Router Database Client.
 * Queries the global registry `vozlab_router` to resolve tenant parameters.
 */
export interface IRouterDatabase {
  /**
   * Resolve internal tenant id and slug from OIDC claim.
   * Returns `null` only when no tenant matches.
   * Throws `InfrastructureError('ERR_DATABASE_CONNECTION_FAILED')` on driver/connection failure.
   */
  findTenantByOidcId(oidcTenantId: string): Promise<{ id: string; slug: string } | null>;

  /**
   * Resolve a tenant by its slug.
   * Returns the internal id, slug and oidc_tenant_id, or null if not provisioned.
   */
  findTenantBySlug(
    slug: string
  ): Promise<{ id: string; slug: string; oidcTenantId: string } | null>;

  /**
   * Resolve a tenant by its internal UUID.
   *
   * Used by the event-join flow, where the global code registry yields the
   * tenant UUID before any JWT exists and the internal JWT still needs the
   * tenant key (`oidc_tenant_id`) used by the tenant guard.
   */
  findTenantById(
    tenantId: string
  ): Promise<{ id: string; slug: string; oidcTenantId: string } | null>;

  /**
   * Resolve physical database connection config for a tenant.
   * Returns `null` only when no `tenant_connections` row exists (tenant unprovisioned).
   * Throws `InfrastructureError('ERR_DATABASE_CONNECTION_FAILED')` on driver/connection failure.
   */
  getTenantDatabaseConfig(tenantId: string): Promise<TenantConnectionConfig | null>;

  /** Cheap liveness probe for the router database. MUST throw on failure. */
  ping(): Promise<void>;

  /**
   * List tenants linked to a global identity (v5 explicit tenant selection).
   */
  findTenantsByGlobalUser(
    globalUserId: string
  ): Promise<Array<{ id: string; slug: string; oidcTenantId: string; status: string }>>;

  /**
   * Resuelve el usuario interno del tenant (`tenant_user_id`) vinculado a una
   * identidad global dentro de un tenant. Devuelve `null` cuando no hay
   * vínculo. Usado por la alta directa por identidad global (v6/TASK-03).
   */
  findGlobalTenantLink(
    globalUserId: string,
    tenantId: string
  ): Promise<{ tenantUserId: string; status: string } | null>;

  /**
   * Upsert the link between a global identity and a tenant user
   * (`global_identity_tenants`). Used when an external identity is created
   * or redeemed into a tenant (v6/TASK-06: global invitation redemption).
   * Idempotent: on conflict updates `tenantUserId`/`status`/`lastSeenAt`.
   */
  linkGlobalTenant(
    globalUserId: string,
    tenantId: string,
    tenantUserId: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'LEFT'
  ): Promise<void>;

  /**
   * Reverse of `findGlobalTenantLink`: the global identity bound to a tenant
   * user. Used by `GET /auth/me` to expose the `globalUserId` the PWA needs
   * for the tenant selector (`switch-tenant`). `null` when there is no link.
   */
  findGlobalIdentityForTenantUser(
    tenantId: string,
    tenantUserId: string
  ): Promise<string | null>;
}