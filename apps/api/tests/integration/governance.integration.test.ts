import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
      description: 'Node created by the governance integration suite.',
      attributes: {},
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
    payload: {
      sourceNodeId,
      targetNodeId,
      relationKey: 'RELATES_TO',
      attributes: {},
    },
  });
  expect(response.statusCode).toBe(201);
  const id = response.json().id as string;
  createdEdgeIds.push(id);
  return id;
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

describe('node/edge governance integration', () => {
  it('activates a pending node', async () => {
    const nodeId = await createNode('Governance node');
    const response = await app!.inject({
      method: 'PUT',
      url: `/api/v1/nodes/${nodeId}/activate`,
      headers: {
        authorization: `Bearer ${maintainerToken}`,
        'x-workspace-id': workspaceId,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ACTIVE');
  });

  it('rejects a pending node', async () => {
    const nodeId = await createNode('Governance rejected node');
    const response = await app!.inject({
      method: 'PUT',
      url: `/api/v1/nodes/${nodeId}/reject`,
      headers: {
        authorization: `Bearer ${maintainerToken}`,
        'x-workspace-id': workspaceId,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('REJECTED');
  });

  it('activates a pending edge', async () => {
    const source = await createNode('Edge src');
    const target = await createNode('Edge tgt');
    const edgeId = await createEdge(source, target);
    const response = await app!.inject({
      method: 'PUT',
      url: `/api/v1/edges/${edgeId}/activate`,
      headers: {
        authorization: `Bearer ${maintainerToken}`,
        'x-workspace-id': workspaceId,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ACTIVE');
  });

  it('rejects a pending edge', async () => {
    const source = await createNode('Edge src2');
    const target = await createNode('Edge tgt2');
    const edgeId = await createEdge(source, target);
    const response = await app!.inject({
      method: 'PUT',
      url: `/api/v1/edges/${edgeId}/reject`,
      headers: {
        authorization: `Bearer ${maintainerToken}`,
        'x-workspace-id': workspaceId,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('REJECTED');
  });
});
