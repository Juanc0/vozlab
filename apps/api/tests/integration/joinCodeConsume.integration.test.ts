import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { workspaces, workspaceJoinCodes } from '@vozlab/database';
import { hashOpaqueToken } from '../../src/shared/auth/refreshToken.js';
import { DrizzleWorkspaceJoinCodeRepository } from '../../src/infrastructure/persistence/repositories/DrizzleWorkspaceJoinCodeRepository.js';
import type { ConnectionPoolManager } from '../../src/infrastructure/persistence/ConnectionPoolManager.js';

/**
 * P4 (audit) — the join-code redemption race, closed and proven.
 *
 * `DrizzleWorkspaceJoinCodeRepository.consume` redeems with ONE conditional
 * `UPDATE … RETURNING` (ADR-0045, modelled on `RouterDatabaseClient.consume`):
 * revocation, expiry and the use cap are enforced by the database itself.
 * This test fires N parallel redemptions against a `max_uses = M` code on
 * the real migrated tenant volume and asserts EXACTLY M succeed and the row
 * lands on `used_count = M` — never overbooked, whatever the interleaving.
 * PostgreSQL serialises the concurrent UPDATEs on the row; the losers find
 * `used_count < max_uses` false and match nothing.
 *
 * The repository's only contact with `ConnectionPoolManager` is `getDb`;
 * the fake below hands it a real Drizzle client over the same tenant pool
 * the rest of the integration suite uses, so the SQL executed here is the
 * SQL production runs.
 */

const tenantPool = new Pool({
  host: process.env.TENANT_DB_HOST,
  port: Number(process.env.TENANT_DB_PORT),
  user: process.env.TENANT_DB_USER,
  password: process.env.TENANT_DB_PASSWORD,
  database: process.env.TENANT_DB_NAME,
  max: 12,
});

const tenantDb = drizzle(tenantPool);
const repo = new DrizzleWorkspaceJoinCodeRepository({
  async getDb() {
    return tenantDb;
  },
  // The repository only ever calls `getDb`; the cast keeps the fake honest
  // without dragging the router resolution into a storage-level test.
} as unknown as ConnectionPoolManager);

const PARALLEL_REDEMPTIONS = 10;
const MAX_USES = 3;

const codeHash = hashOpaqueToken(`P4CODE-${randomUUID()}`);
const tid = randomUUID();
let createdWorkspaceId = '';

beforeAll(async () => {
  const [ws] = await tenantDb
    .insert(workspaces)
    .values({
      slug: `p4-${randomUUID().slice(0, 8)}`,
      name: 'P4 concurrency probe',
      kind: 'PRIVATE',
    })
    .returning();
  createdWorkspaceId = ws.id;
  await tenantDb.insert(workspaceJoinCodes).values({
    workspaceId: createdWorkspaceId,
    codeHash,
    label: 'p4-cap',
    maxUses: MAX_USES,
  });
});

afterAll(async () => {
  if (createdWorkspaceId) {
    await tenantDb
      .delete(workspaceJoinCodes)
      .where(eq(workspaceJoinCodes.workspaceId, createdWorkspaceId));
    await tenantDb
      .delete(workspaces)
      .where(eq(workspaces.id, createdWorkspaceId));
  }
  await tenantPool.end();
});

describe('workspace_join_codes.consume — P4: no overbooking under parallel load', () => {
  it(
    `exactly ${MAX_USES} of ${PARALLEL_REDEMPTIONS} parallel redemptions succeed`,
    async () => {
      const results = await Promise.allSettled(
        Array.from({ length: PARALLEL_REDEMPTIONS }, () =>
          repo.consume(codeHash, tid)
        )
      );

      const successes = results.filter(
        (r) => r.status === 'fulfilled' && r.value !== null
      );
      expect(successes).toHaveLength(MAX_USES);

      // The row itself converged to the cap: never above, never below.
      const [row] = await tenantDb
        .select({ usedCount: workspaceJoinCodes.usedCount })
        .from(workspaceJoinCodes)
        .where(eq(workspaceJoinCodes.codeHash, codeHash))
        .limit(1);
      expect(row.usedCount).toBe(MAX_USES);
    }
  );
});
