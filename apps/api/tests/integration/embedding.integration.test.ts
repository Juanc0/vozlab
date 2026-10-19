import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integration coverage for the agent-only embedding write-back
 * (FR-18, ADR-0020).
 *
 * Runs against the local docker-compose PostgreSQL/Redis with the migrated
 * and seeded dev tenant. The API is exercised in-process with
 * `app.inject()`, so no port is bound and no external IdP is involved: the
 * tokens are signed locally with the same `JWT_SECRET` the API boots with.
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

async function createNode(): Promise<string> {
  const response = await app!.inject({
    method: 'POST',
    url: '/api/v1/nodes',
    headers: {
      authorization: `Bearer ${maintainerToken}`,
      'x-workspace-id': workspaceId,
    },
    payload: {
      typeKey: 'Problem',
      title: 'Integration probe node',
      description: 'Node created by the embedding integration suite.',
    },
  });
  expect(response.statusCode).toBe(201);
  const id = response.json().id as string;
  createdNodeIds.push(id);
  return id;
}

function putEmbedding(nodeId: string, token: string, body: unknown, workspace = workspaceId) {
  return app!.inject({
    method: 'PUT',
    url: `/api/v1/nodes/${nodeId}/embedding`,
    headers: {
      authorization: `Bearer ${token}`,
      'x-workspace-id': workspace,
      'x-correlation-id': 'integration-embedding',
    },
    payload: body as object,
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

describe('embedding write-back integration', () => {
  it('stores the vector for an AGENT_EMBEDDER caller', async () => {
    const nodeId = await createNode();

    const response = await putEmbedding(nodeId, embedderToken, {
      embedding: vector(),
      model: MODEL,
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['x-request-id']).toBe('integration-embedding');

    const rows = await tenantPool.query(
      'select embedding_model, embedded_at, embedding is not null as has_embedding, vector_dims(embedding) as dims from public.nodes where id = $1',
      [nodeId]
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].embedding_model).toBe(MODEL);
    expect(rows.rows[0].embedded_at).not.toBeNull();
    expect(rows.rows[0].has_embedding).toBe(true);
    expect(rows.rows[0].dims).toBe(DIMENSIONS);
  });

  it('rejects a human caller with 403', async () => {
    const nodeId = await createNode();

    const response = await putEmbedding(nodeId, maintainerToken, {
      embedding: vector(),
      model: MODEL,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('ERR_AUTHORIZATION_FAILED');
  });

  it('rejects another agent type with 403', async () => {
    const nodeId = await createNode();
    const extractorToken = signToken({
      sub: '44444444-4444-4444-8444-444444444447',
      authorHash: '7e542874dafc353f457e15db9d96910462164284b71e73ea6d64ac83d3b7405f',
      type: 'AGENT_EXTRACTOR',
    });

    const response = await putEmbedding(nodeId, extractorToken, {
      embedding: vector(),
      model: MODEL,
    });

    expect(response.statusCode).toBe(403);
  });

  it('hides a node of another workspace behind a 404', async () => {
    const nodeId = await createNode();

    const response = await putEmbedding(
      nodeId,
      embedderToken,
      { embedding: vector(), model: MODEL },
      '44444444-4444-4444-8444-444444444444'
    );

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('ERR_NODE_NOT_FOUND');
  });

  it('rejects a vector with the wrong dimension count', async () => {
    const nodeId = await createNode();

    const response = await putEmbedding(nodeId, embedderToken, {
      embedding: vector(512),
      model: MODEL,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('ERR_VALIDATION_FAILED');
  });

  it('rejects an unknown embedding model', async () => {
    const nodeId = await createNode();

    const response = await putEmbedding(nodeId, embedderToken, {
      embedding: vector(),
      model: 'some-other-model',
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('ERR_VALIDATION_FAILED');
  });

  it('reports an unknown node as 404', async () => {
    const response = await putEmbedding(randomUUID(), embedderToken, {
      embedding: vector(),
      model: MODEL,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('ERR_NODE_NOT_FOUND');
  });
});
