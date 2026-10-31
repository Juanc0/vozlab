import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integration coverage for the source resolution route
 * (`GET /api/v1/ingestion/resolve-source`, FR-17, ADR-0009, ADR-0025).
 *
 * The route is agent-only and tenant-scoped, and it does not take an
 * `X-Workspace-ID`: the workspace is the answer.
 */

/** Seeded dev identities carry `author_hash = sha256('dev-<name>')`. */
const devAuthorHash = (name: string): string =>
  createHash('sha256').update(name).digest('hex');

const tenantPool = new Pool({
  host: process.env.TENANT_DB_HOST,
  port: Number(process.env.TENANT_DB_PORT),
  user: process.env.TENANT_DB_USER,
  password: process.env.TENANT_DB_PASSWORD,
  database: process.env.TENANT_DB_NAME,
});

const SEEDED_SOURCE = 'dev-minutes-2026';

let app: FastifyInstance | undefined;
let workspaceId = '';
let agentToken = '';
let humanToken = '';

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

function resolve(sourceId: string, token: string) {
  return app!.inject({
    method: 'GET',
    url: `/api/v1/ingestion/resolve-source?sourceId=${encodeURIComponent(sourceId)}`,
    headers: { authorization: `Bearer ${token}` },
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
    'select author_hash, id from auth.users where author_hash = any($1::text[])',
    [['dev-agent', 'dev-maintainer'].map(devAuthorHash)]
  );
  const byHash = new Map(
    identities.rows.map((row) => [
      row.author_hash as string,
      { id: row.id as string, authorHash: row.author_hash as string },
    ])
  );
  const agent = byHash.get(devAuthorHash('dev-agent'));
  const human = byHash.get(devAuthorHash('dev-maintainer'));
  if (!agent || !human) {
    throw new Error('dev identities missing: run db:seed:dev');
  }

  agentToken = signToken({
    sub: agent.id,
    authorHash: agent.authorHash,
    type: 'AGENT_EXTRACTOR',
  });
  humanToken = signToken({ sub: human.id, authorHash: human.authorHash });
});

afterAll(async () => {
  await app?.close();
  await tenantPool.end();
});

describe('source resolution integration', () => {
  it('resolves the workspace and the behavior profile of a source', async () => {
    const response = await resolve(SEEDED_SOURCE, agentToken);

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.sourceId).toBe(SEEDED_SOURCE);
    expect(payload.workspaceId).toBe(workspaceId);
    expect(payload.connectorType).toBe('MINUTES');
    expect(payload.behaviorProfile).toBe('BATCH');
  });

  it('refuses a human caller', async () => {
    const response = await resolve(SEEDED_SOURCE, humanToken);

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('ERR_AUTHORIZATION_FAILED');
  });

  it('answers 404 for an unknown source', async () => {
    const response = await resolve('does-not-exist', agentToken);

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('ERR_DATA_SOURCE_NOT_FOUND');
  });

  it('requires a sourceId', async () => {
    const response = await app!.inject({
      method: 'GET',
      url: '/api/v1/ingestion/resolve-source',
      headers: { authorization: `Bearer ${agentToken}` },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('ERR_VALIDATION_FAILED');
  });

  it('refuses an unauthenticated caller', async () => {
    const response = await app!.inject({
      method: 'GET',
      url: `/api/v1/ingestion/resolve-source?sourceId=${SEEDED_SOURCE}`,
    });

    expect(response.statusCode).toBe(401);
  });
});
