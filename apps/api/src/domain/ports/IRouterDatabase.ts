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
   * Resolve physical database connection config for a tenant.
   * Returns `null` only when no `tenant_connections` row exists (tenant unprovisioned).
   * Throws `InfrastructureError('ERR_DATABASE_CONNECTION_FAILED')` on driver/connection failure.
   */
  getTenantDatabaseConfig(tenantId: string): Promise<TenantConnectionConfig | null>;

  /** Cheap liveness probe for the router database. MUST throw on failure. */
  ping(): Promise<void>;
}