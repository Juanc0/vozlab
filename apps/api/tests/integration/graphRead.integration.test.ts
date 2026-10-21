import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';
import { nodes } from '@vozlab/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integration coverage of the read path of the graph (roadmap 3.20).
 *
 * Three things are proved against the real PostgreSQL:
 *
 *  1. **The ranking is observable**: a hub with more neighbours than the
 *     limit answers with the **strongest** relations — the rule is
 *     "the strongest relation first, and among equals the most recent".
 *  2. **The indexes exist**: the migration `0007` is applied. A migration
 *     that was never applied fails this suite instead of sitting there.
 *  3. **The window's plan uses the index**: the plan of the window's query
 *     reads `idx_nodes_workspace_created` and does not sort the workspace.
 *     That is the regression guard of the scaling cliff.
 *
 * The API is exercised in-process with `app.inject()`, so no port is bound.
 */

const tenantPool = new Pool({
  host: process.env.TENANT_DB_HOST,
  port: Number(process.env.TENANT_DB_PORT),
  user: process.env.TENANT_DB_USER,
  password: process.env.TENANT_DB_PASSWORD,
  database: process.env.TENANT_DB_NAME,
});

let app: FastifyInstance | undefined;
let workspaceId = '';
let maintainerToken = '';
const createdNodeIds: string[] = [];
const createdEdgeIds: string[] = [];

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

/**
 * Insert a node and a relation directly, so the suite controls the strength
 * (`community_score`) of the relation — the API creates relations with a
 * score of zero and only the votes move it.
 */
async function seedNode(title: string): Promise<string> {
  const id = randomUUID();
  await tenantPool.query(
    `insert into public.nodes
       (id, workspace_id, type_key, title, author_hash, status,
        community_score, created_at, updated_at)
     values ($1, $2, 'Problem', $3, $4, 'ACTIVE', 0, now(), now())`,
    [id, workspaceId, title, 'a'.repeat(64)]
  );
  createdNodeIds.push(id);
  return id;
}

async function seedRelation(
  sourceNodeId: string,
  targetNodeId: string,
  communityScore: number,
  createdAt: string
): Promise<string> {
  const id = randomUUID();
  await tenantPool.query(
    `insert into public.edges
       (id, workspace_id, source_node_id, target_node_id, relation_key,
        status, community_score, author_hash, created_at)
     values ($1, $2, $3, $4, 'INVOLVES', 'ACTIVE', $5, $6, $7)`,
    [
      id,
      workspaceId,
      sourceNodeId,
      targetNodeId,
      communityScore,
      'a'.repeat(64),
      createdAt,
    ]
  );
  createdEdgeIds.push(id);
  return id;
}

function subgraphOf(rootId: string, limit: number, depth = 1) {
  return app!.inject({
    method: 'GET',
    url: `/api/v1/nodes/subgraph?rootId=${rootId}&depth=${depth}&limit=${limit}`,
    headers: {
      authorization: `Bearer ${maintainerToken}`,
      'x-workspace-id': workspaceId,
    },
  });
}

/** Every node of the plan, flattened, with the index it reads. */
function planNodes(plan: unknown): Array<{
  type: string;
  index?: string;
  relation?: string;
}> {
  const out: Array<{ type: string; index?: string; relation?: string }> = [];
  const walk = (node: Record<string, unknown>) => {
    out.push({
      type: String(node['Node Type']),
      index: node['Index Name'] as string | undefined,
      relation: node['Relation Name'] as string | undefined,
    });
    for (const child of (node['Plans'] as unknown[]) ?? []) {
      walk(child as Record<string, unknown>);
    }
  };
  walk(plan as Record<string, unknown>);
  return out;
}

/**
 * The window's query, built with the same builder the adapter uses: the
 * nodes of the workspace, the newest first, bounded by the limit.
 */
function buildWindowQuery(
  workspace: string,
  limit: number
): { sql: string; params: unknown[] } {
  const built = new QueryBuilder()
    .select()
    .from(nodes)
    .where(and(eq(nodes.workspaceId, workspace), isNull(nodes.deletedAt)))
    .orderBy(desc(nodes.createdAt), desc(nodes.id))
    .limit(limit)
    .toSQL();

  return { sql: built.sql, params: built.params };
}

beforeAll(async () => {
  const { buildServer } = await import('../../src/infrastructure/http/server.js');
  app = await buildServer();

  const workspace = await tenantPool.query(
    "select id from auth.workspaces where slug = 'general'"
  );
  if (workspace.rowCount !== 1) {
    throw new Error(
      'integration prerequisites missing: run db:migrate and db:seed:dev against docker-compose'
    );
  }
  workspaceId = workspace.rows[0].id as string;

  const identities = await tenantPool.query(
    'select provider_user_id, id, author_hash from auth.users where provider_user_id = $1',
    ['dev-maintainer']
  );
  if (identities.rowCount !== 1) {
    throw new Error('dev identities missing: run db:seed:dev');
  }
  maintainerToken = signToken({
    sub: identities.rows[0].id as string,
    authorHash: identities.rows[0].author_hash as string,
  });
});

afterAll(async () => {
  if (createdEdgeIds.length > 0) {
    await tenantPool.query('delete from public.edges where id = any($1::uuid[])', [
      createdEdgeIds,
    ]);
  }
  if (createdNodeIds.length > 0) {
    await tenantPool.query('delete from public.nodes where id = any($1::uuid[])', [
      createdNodeIds,
    ]);
  }
  await app?.close();
  await tenantPool.end();
});

describe('the read path of the graph — roadmap 3.20', () => {
  it('answers with the strongest relations when the hub has more neighbours than the limit', async () => {
    const hub = await seedNode('Ranking hub');
    const strong = await seedNode('Ranking strong');
    const second = await seedNode('Ranking second');
    const third = await seedNode('Ranking third');
    const weak = await seedNode('Ranking weak');
    const weakest = await seedNode('Ranking weakest');

    // Five relations, five different strengths: the hub has more neighbours
    // than the limit of the request.
    await seedRelation(hub, strong, 100, '2026-01-01T00:00:00.000Z');
    await seedRelation(hub, second, 50, '2026-01-02T00:00:00.000Z');
    await seedRelation(hub, third, 25, '2026-01-03T00:00:00.000Z');
    await seedRelation(hub, weak, 5, '2026-01-04T00:00:00.000Z');
    await seedRelation(hub, weakest, 1, '2026-01-05T00:00:00.000Z');

    const response = await subgraphOf(hub, 3);

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      nodes: { id: string }[];
      edges: { id: string; communityScore: number }[];
    };

    // The hub and its two strongest neighbours: the neighbourhood that
    // survives the limit is the strongest one.
    expect(body.nodes.map((n) => n.id)).toEqual([hub, strong, second]);

    // The relations come back strongest first.
    expect(body.edges.map((e) => e.communityScore)).toEqual([100, 50]);
  });

  it('breaks a tie of strength with the most recent relation', async () => {
    const hub = await seedNode('Tie hub');
    const older = await seedNode('Tie older');
    const newer = await seedNode('Tie newer');

    await seedRelation(hub, older, 42, '2026-01-01T00:00:00.000Z');
    await seedRelation(hub, newer, 42, '2026-09-01T00:00:00.000Z');

    const response = await subgraphOf(hub, 2);

    const body = response.json() as { nodes: { id: string }[] };
    expect(body.nodes.map((n) => n.id)).toEqual([hub, newer]);
  });

  it('has the ranked indexes and the window index applied', async () => {
    const result = await tenantPool.query(
      `select indexname from pg_indexes
       where schemaname = 'public'
         and indexname in (
           'idx_nodes_workspace_created',
           'idx_edges_workspace_source_ranked',
           'idx_edges_workspace_target_ranked'
         )
       order by indexname`
    );

    // A migration that was never applied fails here.
    expect(result.rows.map((row) => row.indexname)).toEqual([
      'idx_edges_workspace_source_ranked',
      'idx_edges_workspace_target_ranked',
      'idx_nodes_workspace_created',
    ]);
  });

  it('reads the window through the index instead of sorting the workspace', async () => {
    const windowQuery = buildWindowQuery(workspaceId, 100);

    const client = await tenantPool.connect();
    try {
      // The tenant of the suite is small: without the hints the planner
      // would pick a sequential scan and a sort, which is cheaper on a
      // handful of rows. The hints forbid the two paths that do not keep the
      // order of the index, so the plan shows what the planner *can* do —
      // and that is exactly what the index is for.
      await client.query('begin');
      await client.query('set local enable_seqscan = off');
      await client.query('set local enable_bitmapscan = off');
      const result = await client.query(
        `explain (format json) ${windowQuery.sql}`,
        windowQuery.params
      );
      await client.query('commit');

      const plan = result.rows[0]['QUERY PLAN'][0].Plan as Record<string, unknown>;
      const plan_ = planNodes(plan);

      // The index serves the window: the order comes from the index, so the
      // workspace is never sorted.
      expect(
        plan_.some((node) => node.index === 'idx_nodes_workspace_created')
      ).toBe(true);
      expect(plan_.some((node) => node.type === 'Sort')).toBe(false);
      expect(
        plan_.some(
          (node) => node.type === 'Seq Scan' && node.relation === 'public.nodes'
        )
      ).toBe(false);
    } finally {
      client.release();
    }
  });
});
