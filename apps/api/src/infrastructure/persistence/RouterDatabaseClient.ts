import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { env } from '../../shared/config/env.js';
import { log } from '../../shared/logger/index.js';
import { IRouterDatabase, TenantConnectionConfig } from '../../domain/ports/IRouterDatabase.js';
import {
  ConsumeEventCodeResult,
  CreateEventCodeInput,
  IEventCodeRepository,
} from '../../domain/ports/IEventCodeRepository.js';
import { InfrastructureError } from '../../domain/errors/InfrastructureError.js';
import { createRouterDrizzle } from '@vozlab/database';
import { eventCodes, tenants, tenantConnections } from '@vozlab/database';

/**
 * RouterDatabaseClient: adapter that implements IRouterDatabase.
 *
 * Queries the global router database (`vozlab_router`) to resolve tenant
 * metadata and physical connection configuration. This is the ONLY place
 * that knows about the router schema — all other layers go through the port.
 */
export class RouterDatabaseClient
  implements IRouterDatabase, IEventCodeRepository
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
   * Atomically consume one use of an event code.
   *
   * The conditional UPDATE enforces revocation, expiry and capacity in one
   * statement; a concurrent join cannot exceed `max_uses`.
   */
  async consume(codeHash: string): Promise<ConsumeEventCodeResult> {
    const now = new Date();
    try {
      const [row] = await this.db
        .update(eventCodes)
        .set({ usedCount: sql`${eventCodes.usedCount} + 1` })
        .where(
          and(
            eq(eventCodes.codeHash, codeHash),
            isNull(eventCodes.revokedAt),
            gt(eventCodes.expiresAt, now),
            or(
              isNull(eventCodes.maxUses),
              sql`${eventCodes.usedCount} < ${eventCodes.maxUses}`
            )
          )
        )
        .returning();

      if (row) {
        return {
          status: 'OK',
          code: {
            codeId: row.id,
            tenantId: row.tenantId,
            workspaceId: row.workspaceId,
            label: row.label,
          },
        };
      }

      const [existing] = await this.db
        .select()
        .from(eventCodes)
        .where(eq(eventCodes.codeHash, codeHash))
        .limit(1);

      if (!existing) return { status: 'NOT_FOUND' };
      if (existing.revokedAt) return { status: 'REVOKED' };
      if (existing.expiresAt <= now) return { status: 'EXPIRED' };
      return { status: 'FULL' };
    } catch (err) {
      log.error({ err }, 'failed to consume event code');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  async create(input: CreateEventCodeInput): Promise<{ id: string }> {
    try {
      const [row] = await this.db
        .insert(eventCodes)
        .values({
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          codeHash: input.codeHash,
          label: input.label ?? null,
          expiresAt: input.expiresAt,
          maxUses: input.maxUses ?? null,
          createdByHash: input.createdByHash ?? null,
        })
        .returning({ id: eventCodes.id });

      if (!row) {
        throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
      }
      return row;
    } catch (err) {
      if (err instanceof InfrastructureError) throw err;
      log.error({ err }, 'failed to create event code');
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
   * Cheap liveness probe for the router database.
   * Executes `SELECT 1` through Drizzle and throws on failure.
   */
  async ping(): Promise<void> {
    await this.db.execute(sql`SELECT 1`);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}