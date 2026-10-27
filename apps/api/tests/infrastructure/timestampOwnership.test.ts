import { testHash } from '../support/hash.js';
import { describe, expect, it } from 'vitest';
import { Node } from '../../src/domain/entities/Node.js';
import { DrizzleNodeRepository } from '../../src/infrastructure/persistence/repositories/DrizzleNodeRepository.js';
import { ConnectionPoolManager } from '../../src/infrastructure/persistence/ConnectionPoolManager.js';

const authorHash = testHash('author-1');

/**
 * Thin fake Drizzle client: captures the argument of `.set(...)` on the last
 * `UPDATE` and returns a canned row for `SELECT ... LIMIT 1`. Enough to assert
 * the adapter half of the timestamp-ownership rule (TASK-38) without pulling
 * in a real database.
 */
function makeFakeDb(row?: Record<string, unknown>) {
  const calls: { setValues?: Record<string, unknown> } = {};
  const db = {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        calls.setValues = values;
        return { where: async () => undefined };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (row ? [row] : []),
        }),
      }),
    }),
  };
  return { db, calls };
}

function makeRepo(row?: Record<string, unknown>) {
  const { db, calls } = makeFakeDb(row);
  const poolManager = { getDb: async () => db };
  return { repo: new DrizzleNodeRepository(poolManager as unknown as ConnectionPoolManager), calls };
}

function makeNode(): Node {
  return new Node('node-1', 'ws-1', 'Person', 'Ada', null, {}, authorHash, 'ACTIVE');
}

describe('timestamp ownership (adapter persists the domain timestamp)', () => {
  it('update persists node.updatedAt, not a fresh Date', async () => {
    const node = makeNode();
    node.updateAttributes({ country: 'UK' });

    const { repo, calls } = makeRepo();
    await repo.update(node, 'tid-1');

    // Same value (indeed same reference) the domain method stamped.
    expect(calls.setValues?.updatedAt).toBe(node.updatedAt);
  });

  it('applyDelta derives updatedAt from the entity it rebuilds', async () => {
    const oldUpdatedAt = new Date('2026-01-01T00:00:00.000Z');
    const row = {
      id: 'node-1',
      workspaceId: 'ws-1',
      typeKey: 'Person',
      title: 'old',
      description: null,
      attributes: { a: 1 },
      authorHash: authorHash.toString(),
      status: 'ACTIVE',
      communityScore: 0,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: oldUpdatedAt,
      deletedAt: null,
    };

    const { repo, calls } = makeRepo(row);
    await repo.applyDelta('node-1', { title: 'new', attributes: { b: 2 } }, 'ws-1', 'tid-1');

    expect(calls.setValues?.title).toBe('new');
    expect(calls.setValues?.attributes).toEqual({ a: 1, b: 2 });
    // A later timestamp than the persisted row: produced by the entity, not
    // by an adapter-side `new Date()`.
    expect((calls.setValues?.updatedAt as Date).getTime()).toBeGreaterThan(oldUpdatedAt.getTime());
  });
});
