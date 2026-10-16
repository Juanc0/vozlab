import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../../shared/config/env.js';
import { log } from '../../shared/logger/index.js';
import { IRouterDatabase } from '../../domain/ports/IRouterDatabase.js';

/**
 * Cached pool entry.
 */
interface PoolEntry {
  db: ReturnType<typeof drizzle>;
  pool: Pool;
  lastUsed: number;
}

/**
 * ConnectionPoolManager: per-tenant Drizzle connection pool cache.
 *
 * Each tenant has its own physical database (multi-tenant isolation by
 * `tid`). This manager caches pools by tenant id with a TTL to avoid
 * leaking connections when tenants go idle.
 *
 * TTL is configurable via `POOL_TTL_MS` (default 30 minutes).
 */
export class ConnectionPoolManager {
  private readonly cache = new Map<string, PoolEntry>();
  private readonly ttlMs: number;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly routerDb: IRouterDatabase,
    options?: { ttlMs?: number }
  ) {
    this.ttlMs = options?.ttlMs ?? 30 * 60 * 1000; // 30 min
  }

  /**
   * Get or create a Drizzle client for the given tenant id.
   * Caches pools and evicts stale entries.
   */
  async getDb(tid: string): Promise<ReturnType<typeof drizzle>> {
    const now = Date.now();
    const entry = this.cache.get(tid);

    if (entry) {
      entry.lastUsed = now;
      return entry.db;
    }

    // `tid` is the internal tenant UUID; resolve config from the router DB.
    const config = await this.routerDb.getTenantDatabaseConfig(tid);
    if (!config) {
      throw new Error(`ERR_TENANT_NOT_PROVISIONED: tenant ${tid} has no database config`);
    }

    const pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: env.DATABASE_POOL_MAX ?? 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    const db = drizzle(pool);

    pool.on('error', (err) => {
      log.error({ err, tid }, 'tenant pool connection error');
    });

    this.cache.set(tid, { db, pool, lastUsed: now });
    log.debug({ tid }, 'created new tenant connection pool');
    return db;
  }

  /**
   * Close and remove a specific tenant's pool.
   */
  async closePool(tid: string): Promise<void> {
    const entry = this.cache.get(tid);
    if (!entry) return;
    await entry.pool.end();
    this.cache.delete(tid);
    log.debug({ tid }, 'closed tenant pool');
  }

  /**
   * Close all pools (used during shutdown).
   */
  async destroyAll(): Promise<void> {
    for (const [tid, entry] of this.cache) {
      await entry.pool.end();
      log.debug({ tid }, 'closed tenant pool during shutdown');
    }
    this.cache.clear();
  }

  /**
   * Number of currently cached tenant pools (for observability).
   */
  get poolCount(): number {
    return this.cache.size;
  }

  /**
   * Start a periodic cleanup that evicts idle pools past TTL.
   */
  startCleanupInterval(intervalMs = 5 * 60 * 1000): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [tid, entry] of this.cache) {
        if (now - entry.lastUsed > this.ttlMs) {
          entry.pool.end().catch(() => {});
          this.cache.delete(tid);
          log.debug({ tid }, 'evicted idle tenant pool');
        }
      }
    }, intervalMs);
  }

  stopCleanupInterval(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
}
