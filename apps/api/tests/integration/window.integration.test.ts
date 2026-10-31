import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integration coverage for the exploration window
 * (`GET /api/v1/nodes/window`, roadmap 3.11).
 *
 * The unit suite proves the contract against an in-memory fake; this suite
 * proves the SQL: the ordering (`created_at DESC, id DESC`), the
 * workspace filter, the soft-delete filter and — the point of the window —
 * the closed graph: only the relations whose **both** endpoints are inside
 * the window come back.
 *
 * Runs against the local PostgreSQL with the migrated and seeded dev tenant.
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

async function createNode(title: string): Promise<string> {
  const response = await app!.inject({
    method: 'POST',
    url: '/api/v1/nodes',
    headers: {
      authorization: `Bearer ${maintainerToken}`,
      'x-workspace-id': workspaceId,
    },
    payload: {
      typeKey: 'Problem',
      title,
      description: 'Node created by the window integration suite.',
    },
  });
  expect(response.statusCode).toBe(201);
  const id = response.json().id as string;
  createdNodeIds.push(id);
  return id;
}

async function createEdge(sourceNodeId: string, targetNodeId: string): Promise<string> {
  const response = await app!.inject({
    method: 'POST',
    url: '/api/v1/edges',
    headers: {
      authorization: `Bearer ${maintainerToken}`,
      'x-workspace-id': workspaceId,
    },
    payload: { sourceNodeId, targetNodeId, relationKey: 'INVOLVES' },
  });
  expect(response.statusCode).toBe(201);
  const id = response.json().id as string;
  createdEdgeIds.push(id);
  return id;
}

function windowOf(limit?: string) {
  const query = limit ? `?limit=${limit}` : '';
  return app!.inject({
    method: 'GET',
    url: `/api/v1/nodes/window${query}`,
    headers: {
      authorization: `Bearer ${maintainerToken}`,
      'x-workspace-id': workspaceId,
    },
  });
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
    'select author_hash, id from auth.users where author_hash = $1',
    [createHash('sha256').update('dev-maintainer').digest('hex')]
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

describe('the exploration window integration', () => {
  it('returns the newest nodes of the workspace and only the relations among them', async () => {
    const first = await createNode('Window probe A');
    const second = await createNode('Window probe B');
    const third = await createNode('Window probe C');
    const fourth = await createNode('Window probe D');

    // A chain: A -> B -> C -> D. Only the last relation has both of its
    // endpoints inside a two-node window.
    const chain = [
      await createEdge(first, second),
      await createEdge(second, third),
      await createEdge(third, fourth),
    ];

    const response = await windowOf('2');
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      nodes: { id: string }[];
      edges: { id: string; sourceNodeId: string; targetNodeId: string }[];
    };

    // The window holds the two newest nodes, in `created_at DESC, id DESC`.
    const expected = await tenantPool.query(
      `select id from public.nodes
       where workspace_id = $1 and deleted_at is null
       order by created_at desc, id desc
       limit 2`,
      [workspaceId]
    );
    expect(body.nodes.map((n) => n.id)).toEqual(expected.rows.map((row) => row.id));

    // The relations among them are the ones the database holds.
    const inWindow = body.nodes.map((n) => n.id);
    const expectedEdges = await tenantPool.query(
      `select id from public.edges
       where workspace_id = $1
         and deleted_at is null
         and source_node_id = any($2::uuid[])
         and target_node_id = any($2::uuid[])`,
      [workspaceId, inWindow]
    );
    expect(body.edges.map((e) => e.id).sort()).toEqual(
      expectedEdges.rows.map((row) => row.id).sort()
    );

    // The closed graph: a relation that leaves the window is not returned.
    const returned = new Set(body.edges.map((e) => e.id));
    expect(returned.has(chain[2])).toBe(true);
    expect(returned.has(chain[1])).toBe(false);
    expect(returned.has(chain[0])).toBe(false);
  });

  it('clamps the limit instead of rejecting it and defaults to 100', async () => {
    const clamped = await windowOf('1000');
    expect(clamped.statusCode).toBe(200);

    const defaulted = await windowOf();
    expect(defaulted.statusCode).toBe(200);

    const body = defaulted.json() as { nodes: unknown[] };
    expect(body.nodes.length).toBeLessThanOrEqual(200);
  });

  it('answers the same shape as the subgraph', async () => {
    const response = await windowOf('10');
    const body = response.json() as { nodes: object[]; edges: object[] };

    expect(Object.keys(body)).toEqual(['nodes', 'edges']);
    expect(Object.keys(body.nodes[0])).toEqual([
      'id',
      'workspaceId',
      'typeKey',
      'typeDisplayNames',
      'title',
      'description',
      'attributes',
      'authorHash',
      'status',
      'communityScore',
      'createdAt',
      'updatedAt',
    ]);
    expect(Object.keys(body.edges[0])).toEqual([
      'id',
      'sourceNodeId',
      'targetNodeId',
      'relationKey',
      'relationDisplayNames',
      'attributes',
      'authorHash',
      'status',
      'communityScore',
      'createdAt',
    ]);
  });

  it('carries the same relation the full edge carries', async () => {
    const response = await windowOf('10');
    const body = response.json() as {
      edges: Array<{
        id: string;
        attributes: Record<string, unknown>;
        authorHash: string;
        createdAt: string;
      }>;
    };

    const relation = body.edges[0];
    expect(relation).toBeDefined();

    const full = await app!.inject({
      method: 'GET',
      url: `/api/v1/edges/${relation!.id}`,
      headers: {
        authorization: `Bearer ${maintainerToken}`,
        'x-workspace-id': workspaceId,
      },
    });
    expect(full.statusCode).toBe(200);

    const edge = (full.json() as { edge: Record<string, unknown> }).edge;

    // The graph's relation and the full relation are the **same** relation:
    // the same attributes, the same pseudonym and the same instant.
    expect(relation!.attributes).toEqual(edge['attributes']);
    expect(relation!.authorHash).toEqual(edge['authorHash']);
    expect(relation!.createdAt).toEqual(edge['createdAt']);

    // The attributes of a relation without attributes are an empty object,
    // never `null`.
    expect(relation!.attributes).not.toBeNull();
    expect(typeof relation!.attributes).toBe('object');
  });

  it('carries the display names of the class and of the relation', async () => {
    const response = await windowOf('10');
    const body = response.json() as {
      nodes: Array<{ typeKey: string; typeDisplayNames: Record<string, string> }>;
      edges: Array<{ relationKey: string; relationDisplayNames: Record<string, string> }>;
    };

    // The seeded ontology of the workspace: `Problem` is "Problema" and
    // `RELATES_TO` is "Se relaciona con".
    for (const node of body.nodes) {
      expect(node.typeDisplayNames).toEqual(
        expect.objectContaining({ en: expect.any(String), es: expect.any(String) })
      );
    }

    for (const edge of body.edges) {
      expect(edge.relationDisplayNames).toEqual(
        expect.objectContaining({ en: expect.any(String), es: expect.any(String) })
      );
    }
  });
});
