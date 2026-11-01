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

beforeAll(async () => {
  const { buildServer } = await import('../../src/infrastructure/http/server.js');
  app = await buildServer();
  const workspace = await tenantPool.query("select id from auth.workspaces where slug = 'general'");
  workspaceId = workspace.rows[0].id as string;
  const identities = await tenantPool.query('select author_hash, id, system_role from auth.users where author_hash = $1', [createHash('sha256').update('dev-maintainer').digest('hex')]);
  console.log('identities', identities.rows);
  maintainerToken = jwt.sign({ sub: identities.rows[0].id, tid: 'sabana', jti: randomUUID(), authorHash: identities.rows[0].author_hash }, process.env.JWT_SECRET as string, { algorithm: 'HS256', expiresIn: '15m' });
});

describe('debug', () => {
  it('create node', async () => {
    const response = await app!.inject({
      method: 'POST',
      url: '/api/v1/nodes',
      headers: { authorization: `Bearer ${maintainerToken}`, 'x-workspace-id': workspaceId },
      payload: { typeKey: 'Problem', title: 'Debug node', description: 'd', attributes: {} },
    });
    console.log('STATUS', response.statusCode);
    console.log('BODY', response.body);
    expect(true).toBe(true);
  });
});

afterAll(async () => { await app?.close(); await tenantPool.end(); });
