import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integration coverage for the neighbour lookup
 * (`GET /api/v1/nodes/:id/neighbors`, FR-19, ADR-0022).
 *
 * The API is driven in-process with `app.inject()`; the vectors are written
 * through the agent-only embedding route, so the test exercises the same path
 * the embedder worker uses.
 */

const tenantPool = new Pool({
  host: process.env.TENANT_DB_HOST,
  port: Number(process.env.TENANT_DB_PORT),
  user: process.env.TENANT_DB_USER,
  password: process.env.TENANT_DB_PASSWORD,
  database: process.env.TENANT_DB_NAME,
});

const MODEL = 'nomic-embed-text';
const DIMENSIONS = 768;

let app: FastifyInstance | undefined;
let workspaceId = '';
let embedderToken = '';
let maintainerToken = '';
const createdNodeIds: string[] = [];

function vector(dimensions = DIMENSIONS): number[] {
  return new Array(dimensions).fill(0.125);
}

function signToken(claims: {
  sub: string;
  authorHash: string;
  type?: string;
}): string {
  return jwt.sign(
    {
      sub: claims.sub,
      tid: 'sabana',
      jti: randomUUID(),
      authorHash: claims.authorHash,
      ...(claims.type ? { type: claims.type } : {}),
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
    payload: { typeKey: 'Problem', title, description: `${title} description` },
  });
  expect(response.statusCode).toBe(201);
  const id = response.json().id as string;
  createdNodeIds.push(id);
  return id;
}

async function embed(nodeId: string): Promise<void> {
  const response = await app!.inject({
    method: 'PUT',
    url: `/api/v1/nodes/${nodeId}/embedding`,
    headers: {
      authorization: `Bearer ${embedderToken}`,
      'x-workspace-id': workspaceId,
    },
    payload: { embedding: vector(), model: MODEL },
  });
  expect(response.statusCode).toBe(204);
}

function neighbors(nodeId: string, workspace = workspaceId, limit?: string) {
  const query = limit ? `?limit=${limit}` : '';
  return app!.inject({
    method: 'GET',
    url: `/api/v1/nodes/${nodeId}/neighbors${query}`,
    headers: {
      authorization: `Bearer ${maintainerToken}`,
      'x-workspace-id': workspace,
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
    "select provider_user_id, id, author_hash from auth.users where provider_user_id = any($1::text[])",
    [['dev-embedder', 'dev-maintainer']]
  );
  const byProvider = new Map(
    identities.rows.map((row) => [
      row.provider_user_id as string,
      { id: row.id as string, authorHash: row.author_hash as string },
    ])
  );
  const embedder = byProvider.get('dev-embedder');
  const maintainer = byProvider.get('dev-maintainer');
  if (!embedder || !maintainer) {
    throw new Error('dev identities missing: run db:seed:dev');
  }

  embedderToken = signToken({
    sub: embedder.id,
    authorHash: embedder.authorHash,
    type: 'AGENT_EMBEDDER',
  });
  maintainerToken = signToken({
    sub: maintainer.id,
    authorHash: maintainer.authorHash,
  });
});

afterAll(async () => {
  if (createdNodeIds.length > 0) {
    await tenantPool.query('delete from public.nodes where id = any($1::uuid[])', [
      createdNodeIds,
    ]);
  }
  await app?.close();
  await tenantPool.end();
});

describe('neighbour lookup integration', () => {
  it('returns the closest node of the workspace', async () => {
    const source = await createNode('Neighbour probe source');
    const candidate = await createNode('Neighbour probe candidate');
    await embed(source);
    await embed(candidate);

    const response = await neighbors(source);

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.node.id).toBe(source);
    expect(payload.neighbors.length).toBeGreaterThan(0);

    const found = payload.neighbors.find((n: { id: string }) => n.id === candidate);
    expect(found).toBeDefined();
    expect(found.similarity).toBeGreaterThan(0.99);
    expect(found.typeKey).toBe('Problem');
  });

  it('never returns the source node itself', async () => {
    const source = await createNode('Neighbour probe self source');
    await embed(source);

    const payload = (await neighbors(source)).json();

    expect(payload.neighbors.map((n: { id: string }) => n.id)).not.toContain(source);
  });

  it('answers 409 while the node has no vector yet', async () => {
    const nodeId = await createNode('Neighbour probe without vector');

    const response = await neighbors(nodeId);

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('ERR_NODE_NOT_EMBEDDED');
  });

  it('answers 404 for an unknown node', async () => {
    const response = await neighbors(randomUUID());

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('ERR_NODE_NOT_FOUND');
  });

  it('hides a node of another workspace behind a 404', async () => {
    // The caller is a member of BOTH workspaces, and asks for a node that
    // lives in the other one: the answer must be 404, not 403 (ADR-0008).
    const otherWorkspaceId = '99999999-9999-4999-8999-999999999999';
    const otherNodeId = randomUUID();

    await tenantPool.query(
      // join_code is NOT NULL + unique (the tenant baseline).
      "insert into auth.workspaces (id, slug, name, join_code) values ($1, 'neighbour-probe', 'Neighbour probe', $2) on conflict (id) do nothing",
      [otherWorkspaceId, randomUUID().replace(/-/g, '').slice(0, 24)]
    );
    await tenantPool.query(
      `insert into auth.workspace_memberships (id, workspace_id, user_id, role)
       select gen_random_uuid(), $1, id, 'ADMIN' from auth.users where provider_user_id = 'dev-maintainer'
       on conflict do nothing`,
      [otherWorkspaceId]
    );
    await tenantPool.query(
      `insert into public.nodes (id, workspace_id, type_key, title, author_hash, status, embedding, embedding_model, embedded_at)
       values ($1, $2, 'Problem', 'Neighbour probe foreign node', repeat('0', 64), 'PENDING', $3::vector, $4, now())`,
      [
        otherNodeId,
        otherWorkspaceId,
        `[${new Array(DIMENSIONS).fill(0.25).join(',')}]`,
        MODEL,
      ]
    );

    const response = await neighbors(otherNodeId);

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('ERR_NODE_NOT_FOUND');

    await tenantPool.query('delete from public.nodes where id = $1', [otherNodeId]);
    await tenantPool.query(
      'delete from auth.workspace_memberships where workspace_id = $1',
      [otherWorkspaceId]
    );
    await tenantPool.query('delete from auth.workspaces where id = $1', [
      otherWorkspaceId,
    ]);
  });

  it('rejects an out-of-range limit', async () => {
    const source = await createNode('Neighbour probe limit');
    await embed(source);

    const response = await neighbors(source, workspaceId, '99');

    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('ERR_VALIDATION_FAILED');
  });
});
