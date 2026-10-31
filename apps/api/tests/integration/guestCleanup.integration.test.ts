import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RouterDatabaseClient } from '../../src/infrastructure/persistence/RouterDatabaseClient.js';
import { ConnectionPoolManager } from '../../src/infrastructure/persistence/ConnectionPoolManager.js';
import { DrizzleUserRepository } from '../../src/infrastructure/persistence/repositories/DrizzleUserRepository.js';

/**
 * P2 evidence (identity-consolidation T7, D-4 ruling): the guest-cleanup
 * sweep filters `provider = 'ANONYMOUS_EVENT'`.
 *
 * The filter used to be `is_anonymous = TRUE` — a column NO writer ever set,
 * so the sweep silently deleted nothing since inception while every unit test
 * rode on the in-memory fake. This is the first repo-level test against the
 * real tenant database: seed 2 stale guests + 1 fresh guest + 1 institutional
 * user older than the cutoff → cleanup removes ONLY the stale guests.
 *
 * Runs against the local docker-compose PostgreSQL with the migrated and
 * seeded dev tenant (the same prerequisites as the other integration suites).
 */

/** Dev tenant internal UUID (seed-dev's fixed `tenants.id`). */
const DEV_TENANT_ID = '11111111-1111-4111-8111-111111111111';

const tenantPool = new Pool({
  host: process.env.TENANT_DB_HOST,
  port: Number(process.env.TENANT_DB_PORT),
  user: process.env.TENANT_DB_USER,
  password: process.env.TENANT_DB_PASSWORD,
  database: process.env.TENANT_DB_NAME,
});

let routerDb: RouterDatabaseClient | undefined;
let poolManager: ConnectionPoolManager | undefined;
let repo: DrizzleUserRepository | undefined;

/** Unique 64-hex author_hash per run so re-runs never collide. */
const hashFor = (label: string): string =>
  createHash('sha256').update(`guest-cleanup-${label}-${randomUUID()}`).digest('hex');

const staleGuestA = { id: randomUUID(), hash: hashFor('stale-a') };
const staleGuestB = { id: randomUUID(), hash: hashFor('stale-b') };
const freshGuest = { id: randomUUID(), hash: hashFor('fresh') };
const oldInstitutional = { id: randomUUID(), hash: hashFor('inst') };

async function insertUser(user: {
  id: string;
  hash: string;
  provider: 'OIDC_INSTITUTIONAL' | 'ANONYMOUS_EVENT';
  createdAtDaysAgo: number;
}): Promise<void> {
  await tenantPool.query(
    `insert into auth.users (id, provider, author_hash, system_role, created_at)
     values ($1, $2, $3, 'USER', now() - ($4 || ' days')::interval)`,
    [user.id, user.provider, user.hash, String(user.createdAtDaysAgo)]
  );
}

async function exists(id: string): Promise<boolean> {
  const { rowCount } = await tenantPool.query('select 1 from auth.users where id = $1', [id]);
  return rowCount === 1;
}

beforeAll(async () => {
  routerDb = new RouterDatabaseClient();
  poolManager = new ConnectionPoolManager(routerDb);
  repo = new DrizzleUserRepository(poolManager);

  // 2 stale guests (no activity signal at all), 1 fresh guest (created
  // today), 1 institutional user older than the cutoff. The institutional
  // row doubles as the regression guard for the provider filter: only
  // ANONYMOUS_EVENT rows may ever be swept.
  await insertUser({ ...staleGuestA, provider: 'ANONYMOUS_EVENT', createdAtDaysAgo: 200 });
  await insertUser({ ...staleGuestB, provider: 'ANONYMOUS_EVENT', createdAtDaysAgo: 120 });
  await insertUser({ ...freshGuest, provider: 'ANONYMOUS_EVENT', createdAtDaysAgo: 0 });
  await insertUser({ ...oldInstitutional, provider: 'OIDC_INSTITUTIONAL', createdAtDaysAgo: 200 });
});

afterAll(async () => {
  for (const id of [staleGuestA.id, staleGuestB.id, freshGuest.id, oldInstitutional.id]) {
    await tenantPool.query('delete from auth.users where id = $1', [id]);
  }
  await poolManager?.destroyAll();
  await tenantPool.end();
});

describe('removeInactiveGuests (P2 revival)', () => {
  it('deletes ONLY stale anonymous guests, never institutional users', async () => {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const removed = await repo!.removeInactiveGuests(DEV_TENANT_ID, cutoff);

    // Under the dead `is_anonymous = TRUE` filter this was always 0 — the
    // P2 defect. The real DB now matches the provider discriminator.
    expect(removed).toBe(2);
    expect(await exists(staleGuestA.id)).toBe(false);
    expect(await exists(staleGuestB.id)).toBe(false);
    expect(await exists(freshGuest.id)).toBe(true);
    expect(await exists(oldInstitutional.id)).toBe(true);
  });
});
