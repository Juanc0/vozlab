import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integration coverage for the filtered-recall defect (F-04) on a
 * multi-workspace, skewed dataset. The HNSW index is global, so a small
 * workspace's neighbours can be drowned out by a dominant one unless the
 * query uses iterative scan. This test is expected to FAIL (RED) against the
 * current `findNearestInWorkspace` implementation.
 */

const DIMENSIONS = 768;
const LARGE_COUNT = 2000;
const SMALL_COUNT = 50;
const TARGET_COUNT = 5;

const LARGE_SLUG = 'recall-hnsw-large';
const SMALL_SLUG = 'recall-hnsw-small';
const LARGE_WS_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const SMALL_WS_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

const MODEL = 'nomic-embed-text';

const tenantPool = new Pool({
  host: process.env.TENANT_DB_HOST,
  port: Number(process.env.TENANT_DB_PORT),
  user: process.env.TENANT_DB_USER,
  password: process.env.TENANT_DB_PASSWORD,
  database: process.env.TENANT_DB_NAME,
});

let app: FastifyInstance | undefined;
let maintainerToken = '';
let maintainerId = '';
let maintainerAuthorHash = '';
let sourceId = '';
const qVector: number[] = new Array(DIMENSIONS).fill(0.5);
const qVectorString = `[${qVector.join(',')}]`;

function perturb(base: number[], seed: number, magnitude: number): number[] {
  const v = base.slice();
  for (let d = 0; d < 8; d++) {
    v[d] = base[d] + Math.sin(seed * 997 + d * 31) * magnitude;
  }
  return v;
}

function signToken(claims: { sub: string; authorHash: string }): string {
  return jwt.sign(
    {
      sub: claims.sub,
      tid: 'sabana',
      jti: randomUUID(),
      authorHash: claims.authorHash,
    },
    process.env.JWT_SECRET as string,
    { algorithm: 'HS256', expiresIn: '15m' }
  );
}

async function insertNodes(
  rows: { id: string; workspaceId: string; vector: number[] }[]
): Promise<void> {
  const chunkSize = 50;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const params: unknown[] = [];
    let p = 1;
    const placeholders = chunk.map((r) => {
      const ph = `($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++}::vector,$${p++},$${p++})`;
      params.push(
        r.id,
        r.workspaceId,
        'Problem',
        `Recall node ${r.id}`,
        maintainerAuthorHash,
        'ACTIVE',
        `[${r.vector.join(',')}]`,
        MODEL,
        new Date()
      );
      return ph;
    });
    await tenantPool.query(
      `insert into public.nodes (id, workspace_id, type_key, title, author_hash, status, embedding, embedding_model, embedded_at)
       values ${placeholders.join(',')}`,
      params
    );
  }
}

beforeAll(async () => {
  const { buildServer } = await import('../../src/infrastructure/http/server.js');
  app = await buildServer();

  // Clean any leftover from a previous run.
  await tenantPool.query('delete from auth.workspaces where slug in ($1,$2)', [
    LARGE_SLUG,
    SMALL_SLUG,
  ]);

  const identity = await tenantPool.query(
    "select id, author_hash from auth.users where handle = 'dev-maintainer'"
  );
  if (identity.rowCount !== 1) {
    throw new Error('dev-maintainer missing: run db:seed:dev');
  }
  maintainerId = identity.rows[0].id as string;
  maintainerAuthorHash = identity.rows[0].author_hash as string;

  await tenantPool.query(
    "insert into auth.workspaces (id, slug, name) values ($1,$2,$3)",
    [LARGE_WS_ID, LARGE_SLUG, 'Recall large']
  );
  await tenantPool.query(
    "insert into auth.workspaces (id, slug, name) values ($1,$2,$3)",
    [SMALL_WS_ID, SMALL_SLUG, 'Recall small']
  );

  await tenantPool.query(
    `insert into auth.workspace_memberships (workspace_id, user_id, role)
     values ($1,$2,'ADMIN') on conflict do nothing`,
    [LARGE_WS_ID, maintainerId]
  );
  await tenantPool.query(
    `insert into auth.workspace_memberships (workspace_id, user_id, role)
     values ($1,$2,'ADMIN') on conflict do nothing`,
    [SMALL_WS_ID, maintainerId]
  );

  // Large workspace: many nodes very close to q (dominate the global index).
  const largeRows = Array.from({ length: LARGE_COUNT }, (_, i) => ({
    id: randomUUID(),
    workspaceId: LARGE_WS_ID,
    vector: perturb(qVector, i + 1, 0.001),
  }));

  // Small workspace: source (q) + targets (close) + others (farther).
  sourceId = randomUUID();
  const smallRows: { id: string; workspaceId: string; vector: number[] }[] = [
    { id: sourceId, workspaceId: SMALL_WS_ID, vector: qVector.slice() },
  ];
  for (let i = 0; i < TARGET_COUNT; i++) {
    smallRows.push({
      id: randomUUID(),
      workspaceId: SMALL_WS_ID,
      vector: perturb(qVector, 10000 + i, 0.01),
    });
  }
  for (let i = 0; i < SMALL_COUNT - 1 - TARGET_COUNT; i++) {
    smallRows.push({
      id: randomUUID(),
      workspaceId: SMALL_WS_ID,
      vector: perturb(qVector, 20000 + i, 0.1),
    });
  }

  await insertNodes(largeRows);
  await insertNodes(smallRows);

  maintainerToken = signToken({
    sub: maintainerId,
    authorHash: maintainerAuthorHash,
  });
}, 120_000);

afterAll(async () => {
  await tenantPool.query('delete from auth.workspaces where slug in ($1,$2)', [
    LARGE_SLUG,
    SMALL_SLUG,
  ]);
  await app?.close();
  await tenantPool.end();
}, 120_000);

describe('neighbors recall', () => {
  it('achieves recall >= 0.95 on the small workspace', async () => {
    const client = await tenantPool.connect();
    let exactIds: string[] = [];
    try {
      await client.query('BEGIN');
      // SET LOCAL, not SET: a session-level SET survives COMMIT and leaks to
      // whoever borrows this pooled connection next.
      await client.query('SET LOCAL enable_indexscan = off');
      const res = await client.query(
        `SELECT n.id::text AS id
         FROM public.nodes n
         WHERE n.workspace_id = $1
           AND n.id <> $2
           AND n.embedding IS NOT NULL
           AND n.deleted_at IS NULL
           AND n.status IN ('ACTIVE', 'PENDING')
         ORDER BY n.embedding <=> $3::vector
         LIMIT 5`,
        [SMALL_WS_ID, sourceId, qVectorString]
      );
      exactIds = res.rows.map((r) => r.id as string);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const response = await app!.inject({
      method: 'GET',
      url: `/api/v1/nodes/${sourceId}/neighbors?limit=5`,
      headers: {
        authorization: `Bearer ${maintainerToken}`,
        'x-workspace-id': SMALL_WS_ID,
      },
    });

    expect(response.statusCode).toBe(200);
    const apiIds = (response.json().neighbors as { id: string }[]).map(
      (n) => n.id
    );
    const intersection = apiIds.filter((id) => exactIds.includes(id)).length;
    const recall = intersection / 5;
    expect(recall).toBeGreaterThanOrEqual(0.95);
  });
});
