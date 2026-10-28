import { describe, expect, it, vi } from 'vitest';

// Mock env.ts before importing any module that imports it
vi.mock('../../src/shared/config/env.js', () => ({
  env: {
    DATABASE_POOL_MAX: 5,
    LOG_LEVEL: 'info',
    LOG_PRETTY: false,
  },
}));

import { ConnectionPoolManager } from '../../src/infrastructure/persistence/ConnectionPoolManager.js';
import { InfrastructureError } from '../../src/domain/errors/InfrastructureError.js';
import { DomainError } from '../../src/domain/errors/DomainError.js';
import type { IRouterDatabase, TenantConnectionConfig } from '../../src/domain/ports/IRouterDatabase.js';

describe('ConnectionPoolManager', () => {
  it('returns and caches a db client when config is present', async () => {
    let queryCount = 0;
    const fakeRouterDb: IRouterDatabase = {
      async findTenantByOidcId() {
        return null;
      },
      async findTenantById() {
        return null;
      },
      async findTenantBySlug() {
        return null;
      },
      async getTenantDatabaseConfig(tenantId: string): Promise<TenantConnectionConfig | null> {
        queryCount++;
        return {
          host: '127.0.0.1',
          port: 5432,
          database: `db_${tenantId}`,
          user: 'postgres',
          password: 'password',
        };
      },
      async ping() {},
    async findTenantsByGlobalUser() { return []; },
    };

    const manager = new ConnectionPoolManager(fakeRouterDb);

    try {
      const db1 = await manager.getDb('tenant-1');
      expect(db1).toBeDefined();
      expect(queryCount).toBe(1);
      expect(manager.poolCount).toBe(1);

      // Second call should return cached entry and not call getTenantDatabaseConfig again
      const db2 = await manager.getDb('tenant-1');
      expect(db2).toBe(db1);
      expect(queryCount).toBe(1);
    } finally {
      await manager.destroyAll();
    }
  });

  it('throws DomainError(ERR_TENANT_NOT_PROVISIONED) when config is null', async () => {
    const fakeRouterDb: IRouterDatabase = {
      async findTenantByOidcId() {
        return null;
      },
      async findTenantById() {
        return null;
      },
      async findTenantBySlug() {
        return null;
      },
      async getTenantDatabaseConfig(): Promise<TenantConnectionConfig | null> {
        return null;
      },
      async ping() {},
    async findTenantsByGlobalUser() { return []; },
    };

    const manager = new ConnectionPoolManager(fakeRouterDb);

    await expect(manager.getDb('nonexistent-tenant')).rejects.toThrowError(
      new DomainError('ERR_TENANT_NOT_PROVISIONED', 'tenant nonexistent-tenant has no database config')
    );
    expect(manager.poolCount).toBe(0);
  });

  it('propagates InfrastructureError directly without wrapping or swallowing', async () => {
    const infraError = new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    const fakeRouterDb: IRouterDatabase = {
      async findTenantByOidcId() {
        return null;
      },
      async findTenantById() {
        return null;
      },
      async findTenantBySlug() {
        return null;
      },
      async getTenantDatabaseConfig(): Promise<TenantConnectionConfig | null> {
        throw infraError;
      },
      async ping() {},
    async findTenantsByGlobalUser() { return []; },
    };

    const manager = new ConnectionPoolManager(fakeRouterDb);

    await expect(manager.getDb('tenant-outage')).rejects.toThrow(infraError);
    expect(manager.poolCount).toBe(0);
  });
});
