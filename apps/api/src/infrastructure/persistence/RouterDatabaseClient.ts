import { and, eq, sql } from 'drizzle-orm';
import { env } from '../../shared/config/env.js';
import { log } from '../../shared/logger/index.js';
import { IRouterDatabase, TenantConnectionConfig } from '../../domain/ports/IRouterDatabase.js';
import { IGlobalUserRepository, GlobalUser, GlobalUserProfile } from '../../domain/ports/IGlobalUserRepository.js';
import { ITenantIdentityProviderRepository, TenantIdentityProvider } from '../../domain/ports/ITenantIdentityProviderRepository.js';
import { GlobalUserEventInput, IGlobalUserEventRepository } from '../../domain/ports/IGlobalUserEventRepository.js';
import {
  CredentialRouteKind,
  ICredentialRouteRepository,
} from '../../domain/ports/ICredentialRouteRepository.js';
import { globalUsers } from '@vozlab/database';
import { InfrastructureError } from '../../domain/errors/InfrastructureError.js';
import { createRouterDrizzle } from '@vozlab/database';
import { credentialRoutes, tenants, tenantConnections, tenantIdentityProviders, globalUserTenants, globalUserEvents } from '@vozlab/database';

/**
 * RouterDatabaseClient: adapter that implements IRouterDatabase.
 *
 * Queries the global router database (`vozlab_router`) to resolve tenant
 * metadata and physical connection configuration. This is the ONLY place
 * that knows about the router schema — all other layers go through the port.
 */
export class RouterDatabaseClient
  implements IRouterDatabase, ICredentialRouteRepository, IGlobalUserRepository, ITenantIdentityProviderRepository, IGlobalUserEventRepository
{
  private db: ReturnType<typeof createRouterDrizzle>['db'];
  private pool: ReturnType<typeof createRouterDrizzle>['pool'];

  constructor() {
    const client = createRouterDrizzle({
      host: env.ROUTER_DB_HOST,
      port: env.ROUTER_DB_PORT,
      database: env.ROUTER_DB_NAME,
      user: env.ROUTER_DB_USER,
      password: env.ROUTER_DB_PASSWORD,
    });
    this.db = client.db;
    this.pool = client.pool;
  }

  /**
   * Find a tenant by its OIDC claim `tid`.
   * Returns the internal tenant id and slug, or null if not provisioned.
   * Throws InfrastructureError('ERR_DATABASE_CONNECTION_FAILED') on driver/connection failure.
   */
  async findTenantByOidcId(
    oidcTenantId: string
  ): Promise<{ id: string; slug: string } | null> {
    try {
      const [row] = await this.db
        .select()
        .from(tenants)
        .where(eq(tenants.oidcTenantId, oidcTenantId))
        .limit(1);

      if (!row) return null;
      return { id: row.id, slug: row.slug };
    } catch (err) {
      log.error({ err, oidcTenantId }, 'failed to find tenant by OIDC id');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  /**
   * Resolve a tenant by its slug.
   */
  async findTenantBySlug(
    slug: string
  ): Promise<{ id: string; slug: string; oidcTenantId: string } | null> {
    try {
      const [row] = await this.db
        .select({
          id: tenants.id,
          slug: tenants.slug,
          oidcTenantId: tenants.oidcTenantId,
        })
        .from(tenants)
        .where(eq(tenants.slug, slug))
        .limit(1);

      return row ?? null;
    } catch (err) {
      log.error({ err, slug }, 'failed to find tenant by slug');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  /**
   * Resolve a tenant by its internal UUID (event-join path).
   */
  async findTenantById(
    tenantId: string
  ): Promise<{ id: string; slug: string; oidcTenantId: string } | null> {
    try {
      const [row] = await this.db
        .select({
          id: tenants.id,
          slug: tenants.slug,
          oidcTenantId: tenants.oidcTenantId,
        })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      return row ?? null;
    } catch (err) {
      log.error({ err, tenantId }, 'failed to find tenant by id');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  /**
   * Find or create a global user by (issuer, subject), upserting profile.
   */
  async findOrCreate(
    issuer: string,
    subject: string,
    profile?: GlobalUserProfile
  ): Promise<GlobalUser> {
    try {
      const [existing] = await this.db
        .select()
        .from(globalUsers)
        .where(
          and(
            eq(globalUsers.issuer, issuer),
            eq(globalUsers.subject, subject)
          )
        )
        .limit(1);

      const now = new Date();
      const values = {
        emailHash: profile?.emailHash ?? null,
        emailVerified: profile?.emailVerified ?? false,
        fullName: profile?.fullName ?? null,
        picture: profile?.picture ?? null,
        lastLoginAt: now,
        lastSeenAt: now,
      };

      if (existing) {
        await this.db
          .update(globalUsers)
          .set(values)
          .where(eq(globalUsers.id, existing.id));
        return {
          id: existing.id,
          issuer: existing.issuer,
          subject: existing.subject,
          emailHash: values.emailHash,
          emailVerified: values.emailVerified,
          fullName: values.fullName,
          picture: values.picture,
          lastLoginAt: values.lastLoginAt,
          createdAt: existing.createdAt,
          lastSeenAt: values.lastSeenAt,
        };
      }

      const [created] = await this.db
        .insert(globalUsers)
        .values({ issuer, subject, ...values })
        .onConflictDoNothing()
        .returning();

      if (created) {
        return {
          id: created.id,
          issuer: created.issuer,
          subject: created.subject,
          emailHash: created.emailHash ?? null,
          emailVerified: created.emailVerified,
          fullName: created.fullName ?? null,
          picture: created.picture ?? null,
          lastLoginAt: created.lastLoginAt ?? null,
          createdAt: created.createdAt,
          lastSeenAt: created.lastSeenAt,
        };
      }

      // Race condition: re-read.
      const [raced] = await this.db
        .select()
        .from(globalUsers)
        .where(
          and(
            eq(globalUsers.issuer, issuer),
            eq(globalUsers.subject, subject)
          )
        )
        .limit(1);

      if (!raced) {
        throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
      }
      return {
        id: raced.id,
        issuer: raced.issuer,
        subject: raced.subject,
        emailHash: raced.emailHash ?? null,
        emailVerified: raced.emailVerified,
        fullName: raced.fullName ?? null,
        picture: raced.picture ?? null,
        lastLoginAt: raced.lastLoginAt ?? null,
        createdAt: raced.createdAt,
        lastSeenAt: raced.lastSeenAt,
      };
    } catch (err) {
      log.error({ err, issuer, subject }, 'failed to find or create global user');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  /**
   * Update profile fields for an existing identity.
   */
  async updateProfile(id: string, profile: GlobalUserProfile): Promise<void> {
    try {
      await this.db
        .update(globalUsers)
        .set({
          emailHash: profile.emailHash ?? undefined,
          emailVerified: profile.emailVerified,
          fullName: profile.fullName ?? undefined,
          picture: profile.picture ?? undefined,
          lastLoginAt: new Date(),
          lastSeenAt: new Date(),
        })
        .where(eq(globalUsers.id, id));
    } catch (err) {
      log.error({ err, id }, 'failed to update global user profile');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  /**
   * Find a global user by its ID.
   */
  async findById(id: string): Promise<GlobalUser | null> {
    try {
      const [row] = await this.db
        .select()
        .from(globalUsers)
        .where(eq(globalUsers.id, id))
        .limit(1);

      if (!row) return null;
      return {
        id: row.id,
        issuer: row.issuer,
        subject: row.subject,
        emailHash: row.emailHash ?? null,
        emailVerified: row.emailVerified,
        fullName: row.fullName ?? null,
        picture: row.picture ?? null,
        lastLoginAt: row.lastLoginAt ?? null,
        createdAt: row.createdAt,
        lastSeenAt: row.lastSeenAt,
      };
    } catch (err) {
      log.error({ err, id }, 'failed to find global user by id');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  /**
   * Thin credential directory lookup (ADR-0046): resolve the owning tenant
   * for a credential hash of a given kind. Routing is NOT authority — a
   * returned tenant id still has to answer the tenant-side conditional
   * redemption or the caller sees a plain 404.
   */
  async findTenantId(
    credentialHash: string,
    kind: CredentialRouteKind
  ): Promise<string | null> {
    try {
      const [row] = await this.db
        .select({ tenantId: credentialRoutes.tenantId })
        .from(credentialRoutes)
        .where(
          and(
            eq(credentialRoutes.credentialHash, credentialHash),
            eq(credentialRoutes.kind, kind)
          )
        )
        .limit(1);
      return row?.tenantId ?? null;
    } catch (err) {
      log.error({ err, kind }, 'failed to resolve credential route');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  /**
   * Idempotent directory insert (ADR-0046 + DEC-9): make a credential hash
   * routable. The credential's AUTHORITY already lives in the tenant — this
   * row only answers "which tenant?" — so a duplicate insert is a silent
   * no-op and a re-push of a lost route is safe.
   */
  async ensureRoute(
    credentialHash: string,
    kind: CredentialRouteKind,
    tenantId: string
  ): Promise<void> {
    try {
      await this.db
        .insert(credentialRoutes)
        .values({ credentialHash, kind, tenantId })
        .onConflictDoNothing();
    } catch (err) {
      log.error({ err, kind, tenantId }, 'failed to record credential route');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  /**
   * Resolve the physical database connection config for a tenant.
   * Returns null if the tenant has no provisioned connection row.
   * Throws InfrastructureError('ERR_DATABASE_CONNECTION_FAILED') on driver/connection failure.
   */
  async getTenantDatabaseConfig(
    tenantId: string
  ): Promise<TenantConnectionConfig | null> {
    try {
      const [row] = await this.db
        .select()
        .from(tenantConnections)
        .where(eq(tenantConnections.tenantId, tenantId))
        .limit(1);

      if (!row) return null;
      return {
        host: row.host,
        port: row.port,
        database: row.database,
        user: row.user,
        password: row.password,
      };
    } catch (err) {
      log.error({ err, tenantId }, 'failed to resolve tenant database config');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  /**
   * List tenants linked to a global user (v5 explicit tenant selection).
   */
  async findTenantsByGlobalUser(
    globalUserId: string
  ): Promise<Array<{ id: string; slug: string; oidcTenantId: string; status: string }>> {
    try {
      const rows = await this.db
        .select({
          id: tenants.id,
          slug: tenants.slug,
          oidcTenantId: tenants.oidcTenantId,
          status: globalUserTenants.status,
        })
        .from(globalUserTenants)
        .innerJoin(tenants, eq(globalUserTenants.tenantId, tenants.id))
        .where(eq(globalUserTenants.globalUserId, globalUserId));

      return rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        oidcTenantId: r.oidcTenantId,
        status: r.status,
      }));
    } catch (err) {
      log.error({ err, globalUserId }, 'failed to find tenants by global user');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  /**
   * Resolve the tenant-internal user linked to a global user
   * (v6/TASK-03: admin's direct add by global user.)
   */
  async findGlobalUserTenantLink(
    globalUserId: string,
    tenantId: string
  ): Promise<{ tenantUserId: string; status: string } | null> {
    try {
      const [row] = await this.db
        .select({
          tenantUserId: globalUserTenants.tenantUserId,
          status: globalUserTenants.status,
        })
        .from(globalUserTenants)
        .where(
          and(
            eq(globalUserTenants.globalUserId, globalUserId),
            eq(globalUserTenants.tenantId, tenantId)
          )
        )
        .limit(1);
      return row ?? null;
    } catch (err) {
      log.error({ err, globalUserId, tenantId }, 'failed to find global tenant link');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  /**
   * Upsert the global user ↔ tenant user link (v6/TASK-06).
   * Idempotent on `(global_user_id, tenant_id)`; refreshes
   * `tenant_user_id`, `status` and `last_seen_at` on conflict.
   */
  async linkGlobalUserTenant(
    globalUserId: string,
    tenantId: string,
    tenantUserId: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'LEFT'
  ): Promise<void> {
    try {
      await this.db
        .insert(globalUserTenants)
        .values({
          globalUserId: globalUserId,
          tenantId,
          tenantUserId,
          status,
        })
        .onConflictDoUpdate({
          target: [globalUserTenants.globalUserId, globalUserTenants.tenantId],
          set: { tenantUserId, status, lastSeenAt: new Date() },
        });
    } catch (err) {
      log.error(
        { err, globalUserId, tenantId, tenantUserId },
        'failed to link global user to tenant'
      );
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  /**
   * Resolve the global user linked to a tenant user (v6/TASK-01: the PWA
   * needs its `globalUserId` to render the tenant switcher).
   */
  async findGlobalUserIdForTenantUser(
    tenantId: string,
    tenantUserId: string
  ): Promise<string | null> {
    try {
      const [row] = await this.db
        .select({ globalUserId: globalUserTenants.globalUserId })
        .from(globalUserTenants)
        .where(
          and(
            eq(globalUserTenants.tenantId, tenantId),
            eq(globalUserTenants.tenantUserId, tenantUserId)
          )
        )
        .limit(1);
      return row?.globalUserId ?? null;
    } catch (err) {
      log.error(
        { err, tenantId, tenantUserId },
        'failed to resolve global user for tenant user'
      );
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  // --- IGlobalUserEventRepository ---

  /** Append a cross-tenant identity event. Never update/delete from code. */
  async recordUserEvent(input: GlobalUserEventInput): Promise<void> {
    try {
      await this.db.insert(globalUserEvents).values({
        globalUserId: input.globalUserId,
        tenantId: input.tenantId,
        actorType: input.actorType,
        actorId: input.actorId,
        action: input.action,
        metadata:
          input.metadata && Object.keys(input.metadata).length > 0
            ? JSON.stringify(input.metadata)
            : null,
        requestId: input.requestId ?? null,
      });
    } catch (err) {
      log.error(
        { err, globalUserId: input.globalUserId, action: input.action },
        'failed to record global user event'
      );
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  /**
   * Cheap liveness probe for the router database.
   * Executes `SELECT 1` through Drizzle and throws on failure.
   */
  async ping(): Promise<void> {
    await this.db.execute(sql`SELECT 1`);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // --- ITenantIdentityProviderRepository ---

  async listByTenant(tenantId: string): Promise<TenantIdentityProvider[]> {
    try {
      const rows = await this.db
        .select()
        .from(tenantIdentityProviders)
        .where(eq(tenantIdentityProviders.tenantId, tenantId));

      return rows.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        providerKind: row.providerKind as TenantIdentityProvider['providerKind'],
        issuer: row.issuer,
        clientId: row.clientId,
        metadataUrl: row.metadataUrl,
        enabled: row.enabled,
        createdAt: row.createdAt,
      }));
    } catch (err) {
      log.error({ err, tenantId }, 'failed to list tenant identity providers');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  async findByIssuer(issuer: string): Promise<TenantIdentityProvider | null> {
    try {
      const [row] = await this.db
        .select()
        .from(tenantIdentityProviders)
        .where(eq(tenantIdentityProviders.issuer, issuer))
        .limit(1);

      if (!row) return null;
      return {
        id: row.id,
        tenantId: row.tenantId,
        providerKind: row.providerKind as TenantIdentityProvider['providerKind'],
        issuer: row.issuer,
        clientId: row.clientId,
        metadataUrl: row.metadataUrl,
        enabled: row.enabled,
        createdAt: row.createdAt,
      };
    } catch (err) {
      log.error({ err, issuer }, 'failed to find tenant identity provider by issuer');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  async createProvider(input: {
    tenantId: string;
    providerKind: TenantIdentityProvider['providerKind'];
    issuer: string;
    clientId?: string | null;
    metadataUrl?: string | null;
  }): Promise<TenantIdentityProvider> {
    try {
      const [row] = await this.db
        .insert(tenantIdentityProviders)
        .values({
          tenantId: input.tenantId,
          providerKind: input.providerKind,
          issuer: input.issuer,
          clientId: input.clientId ?? null,
          metadataUrl: input.metadataUrl ?? null,
          enabled: true,
        })
        .returning();

      return {
        id: row.id,
        tenantId: row.tenantId,
        providerKind: row.providerKind as TenantIdentityProvider['providerKind'],
        issuer: row.issuer,
        clientId: row.clientId,
        metadataUrl: row.metadataUrl,
        enabled: row.enabled,
        createdAt: row.createdAt,
      };
    } catch (err) {
      log.error({ err, input }, 'failed to create tenant identity provider');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    try {
      await this.db
        .update(tenantIdentityProviders)
        .set({ enabled })
        .where(eq(tenantIdentityProviders.id, id));
    } catch (err) {
      log.error({ err, id }, 'failed to set tenant identity provider enabled');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }
}