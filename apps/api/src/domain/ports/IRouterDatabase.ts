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
  findTenantByOidcId(oidcTenantId: string): Promise<{ id: string; slug: string } | null>;
  getTenantDatabaseConfig(tenantId: string): Promise<TenantConnectionConfig | null>;
  /** Cheap liveness probe for the router database. MUST throw on failure. */
  ping(): Promise<void>;
}