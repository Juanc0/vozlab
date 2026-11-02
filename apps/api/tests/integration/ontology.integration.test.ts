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
let tenantOidcId = 'sabana';
const createdNodeIds: string[] = [];
const createdPropertyIds: { table: 'datatype' | 'object'; id: string }[] = [];
const createdProposalIds: string[] = [];

function signToken(claims: { sub: string; authorHash: string }): string {
  return jwt.sign(
    {
      sub: claims.sub,
      tid: tenantOidcId,
      jti: randomUUID(),
      authorHash: claims.authorHash,
    },
    process.env.JWT_SECRET as string,
    { algorithm: 'HS256', expiresIn: '15m' }
  );
}

beforeAll(async () => {
  const { buildServer } = await import('../../src/infrastructure/http/server.js');
  app = await buildServer();

  const routerPool = new Pool({
    host: process.env.ROUTER_DB_HOST,
    port: Number(process.env.ROUTER_DB_PORT),
    user: process.env.ROUTER_DB_USER,
    password: process.env.ROUTER_DB_PASSWORD,
    database: process.env.ROUTER_DB_NAME,
  });
  const t = await routerPool.query(
    "select oidc_tenant_id from public.tenants where slug = 'sabana'"
  );
  if (t.rowCount === 1) tenantOidcId = t.rows[0].oidc_tenant_id as string;
  await routerPool.end();

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
  for (const p of createdPropertyIds) {
    const table =
      p.table === 'datatype'
        ? 'meta.datatype_properties'
        : 'meta.object_properties';
    await tenantPool.query(`delete from ${table} where id = $1`, [p.id]);
  }
  if (createdProposalIds.length > 0) {
    await tenantPool.query(
      'delete from social.discussion_threads where target_id = any($1::uuid[])',
      [createdProposalIds]
    );
    await tenantPool.query('delete from public.edit_proposals where id = any($1::uuid[])', [
      createdProposalIds,
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

describe('ontology property governance integration', () => {
  it('activates a proposed datatype property', async () => {
    const key = `it_datatype_${randomUUID().slice(0, 8)}`;
    const createRes = await app!.inject({
      method: 'POST',
      url: '/api/v1/ontology/datatype-properties',
      headers: {
        authorization: `Bearer ${maintainerToken}`,
        'x-workspace-id': workspaceId,
      },
      payload: {
        systemKey: key,
        displayNames: { es: 'Propiedad IT', en: 'IT Property' },
        domainClassKey: 'Problem',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const id = createRes.json().id as string;
    createdPropertyIds.push({ table: 'datatype', id });

    const activateRes = await app!.inject({
      method: 'PUT',
      url: `/api/v1/ontology/datatype-properties/${id}/activate`,
      headers: {
        authorization: `Bearer ${maintainerToken}`,
        'x-workspace-id': workspaceId,
      },
    });
    expect(activateRes.statusCode).toBe(200);
    expect(activateRes.json().status).toBe('ACTIVE');
  });

  it('rejects a proposed datatype property with incomplete locale', async () => {
    const key = `it_datatype_${randomUUID().slice(0, 8)}`;
    const createRes = await app!.inject({
      method: 'POST',
      url: '/api/v1/ontology/datatype-properties',
      headers: {
        authorization: `Bearer ${maintainerToken}`,
        'x-workspace-id': workspaceId,
      },
      payload: {
        systemKey: key,
        displayNames: { es: 'Solo es' },
        domainClassKey: 'Problem',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const id = createRes.json().id as string;
    createdPropertyIds.push({ table: 'datatype', id });

    const activateRes = await app!.inject({
      method: 'PUT',
      url: `/api/v1/ontology/datatype-properties/${id}/activate`,
      headers: {
        authorization: `Bearer ${maintainerToken}`,
        'x-workspace-id': workspaceId,
      },
    });
    expect(activateRes.statusCode).toBe(422);
  });

  it('rejects a proposed object property', async () => {
    const key = `it_object_${randomUUID().slice(0, 8)}`;
    const createRes = await app!.inject({
      method: 'POST',
      url: '/api/v1/ontology/object-properties',
      headers: {
        authorization: `Bearer ${maintainerToken}`,
        'x-workspace-id': workspaceId,
      },
      payload: {
        systemKey: key,
        displayNames: { es: 'Rel IT', en: 'Rel IT' },
        domainClassKey: 'Problem',
        rangeClassKey: 'Idea',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const id = createRes.json().id as string;
    createdPropertyIds.push({ table: 'object', id });

    const rejectRes = await app!.inject({
      method: 'PUT',
      url: `/api/v1/ontology/object-properties/${id}/reject`,
      headers: {
        authorization: `Bearer ${maintainerToken}`,
        'x-workspace-id': workspaceId,
      },
    });
    expect(rejectRes.statusCode).toBe(200);
    expect(rejectRes.json().status).toBe('REJECTED');
  });
});

describe('proposal auto-opens thread integration', () => {
  it('creates a discussion thread linked to the proposal', async () => {
    // create a node to target
    const nodeRes = await app!.inject({
      method: 'POST',
      url: '/api/v1/nodes',
      headers: {
        authorization: `Bearer ${maintainerToken}`,
        'x-workspace-id': workspaceId,
      },
      payload: {
        typeKey: 'Problem',
        title: `IT proposal node ${randomUUID().slice(0, 6)}`,
        description: 'node for proposal-thread integration',
        attributes: {},
      },
    });
    expect(nodeRes.statusCode).toBe(201);
    const nodeId = nodeRes.json().id as string;
    createdNodeIds.push(nodeId);

    const proposalRes = await app!.inject({
      method: 'POST',
      url: '/api/v1/proposals',
      headers: {
        authorization: `Bearer ${maintainerToken}`,
        'x-workspace-id': workspaceId,
      },
      payload: {
        targetId: nodeId,
        targetType: 'NODE',
        proposedChanges: { title: 'Renamed by IT' },
        justification: 'IT thread check',
      },
    });
    expect(proposalRes.statusCode).toBe(201);
    const proposalId = proposalRes.json().id as string;
    createdProposalIds.push(proposalId);

    const threadRow = await tenantPool.query(
      "select id from social.discussion_threads where target_type = 'PROPOSAL' and target_id = $1",
      [proposalId]
    );
    expect(threadRow.rowCount).toBe(1);
  });
});