import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integration coverage for the merge contract (ADR-0026).
 *
 * A merge proposal is created through the API, reviewed like any other
 * proposal and applied by the API when it is approved: the duplicate leaves
 * the graph, the survivor adopts what it can and the duplicate's edges are
 * re-pointed.
 *
 * Runs against the local docker-compose PostgreSQL/Redis with the migrated
 * and seeded dev tenant. The API is exercised in-process with
 * `app.inject()`, so no port is bound and no external IdP is involved.
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
const createdProposalIds: string[] = [];

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

async function createNode(
  title: string,
  attributes: Record<string, unknown> = {},
  typeKey = 'Problem'
): Promise<string> {
  const response = await app!.inject({
    method: 'POST',
    url: '/api/v1/nodes',
    headers: {
      authorization: `Bearer ${maintainerToken}`,
      'x-workspace-id': workspaceId,
    },
    payload: {
      typeKey,
      title,
      description: 'Node created by the merge integration suite.',
      attributes,
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
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json().id as string;
}

function proposeMerge(targetId: string, mergeIntoNodeId: string) {
  return app!.inject({
    method: 'POST',
    url: '/api/v1/proposals',
    headers: {
      authorization: `Bearer ${maintainerToken}`,
      'x-workspace-id': workspaceId,
    },
    payload: {
      kind: 'MERGE',
      targetId,
      targetType: 'NODE',
      proposedChanges: { mergeIntoNodeId },
      justification: 'Integration probe',
    },
  });
}

function approveProposal(proposalId: string) {
  return app!.inject({
    method: 'PUT',
    url: `/api/v1/proposals/${proposalId}/approve`,
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
  if (createdProposalIds.length > 0) {
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

describe('merge proposal integration', () => {
  it('creates a merge proposal and applies it on approval', async () => {
    const survivor = await createNode('Integration survivor', { area: 'mobility' });
    const duplicate = await createNode('Integration duplicate', {
      area: 'transport',
      source: 'minutes',
    });
    const other = await createNode('Integration neighbour', {}, 'Idea');
    const edgeId = await createEdge(duplicate, other);

    const created = await proposeMerge(duplicate, survivor);
    expect(created.statusCode).toBe(201);
    expect(created.json().kind).toBe('MERGE');
    const proposalId = created.json().id as string;
    createdProposalIds.push(proposalId);

    // The proposal is visible with its kind.
    const fetched = await app!.inject({
      method: 'GET',
      url: `/api/v1/proposals/${proposalId}`,
      headers: {
        authorization: `Bearer ${maintainerToken}`,
        'x-workspace-id': workspaceId,
      },
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().proposal.kind).toBe('MERGE');

    const approved = await approveProposal(proposalId);
    expect(approved.statusCode).toBe(200);
    expect(approved.json().status).toBe('APPROVED_BY_AUTHOR');

    // The duplicate leaves the graph and points at the survivor.
    const duplicateRow = await tenantPool.query(
      'select status, merged_into_id from public.nodes where id = $1',
      [duplicate]
    );
    expect(duplicateRow.rows[0].status).toBe('MERGED');
    expect(duplicateRow.rows[0].merged_into_id).toBe(survivor);

    // The survivor adopted the attributes it did not have and kept its own.
    const survivorRow = await tenantPool.query(
      'select attributes from public.nodes where id = $1',
      [survivor]
    );
    expect(survivorRow.rows[0].attributes).toMatchObject({
      area: 'mobility',
      source: 'minutes',
    });

    // The duplicate's edge now starts at the survivor.
    const edgeRow = await tenantPool.query(
      'select source_node_id, target_node_id, deleted_at from public.edges where id = $1',
      [edgeId]
    );
    expect(edgeRow.rows[0].source_node_id).toBe(survivor);
    expect(edgeRow.rows[0].target_node_id).toBe(other);
    expect(edgeRow.rows[0].deleted_at).toBeNull();
  });

  it('refuses a second pending merge proposal for the same node', async () => {
    const survivor = await createNode('Second probe survivor');
    const duplicate = await createNode('Second probe duplicate');

    const first = await proposeMerge(duplicate, survivor);
    expect(first.statusCode).toBe(201);
    createdProposalIds.push(first.json().id as string);

    const second = await proposeMerge(duplicate, survivor);
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('ERR_DUPLICATE_PROPOSAL');
  });

  it('refuses a merge into a node of another workspace as not found', async () => {
    const duplicate = await createNode('Foreign probe duplicate');

    const response = await proposeMerge(
      duplicate,
      '99999999-9999-4999-8999-999999999999'
    );

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('ERR_NODE_NOT_FOUND');
  });

  it('refuses a merge into itself', async () => {
    const duplicate = await createNode('Self probe duplicate');

    const response = await proposeMerge(duplicate, duplicate);

    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('ERR_VALIDATION_FAILED');
  });

  it('refuses the second half of a merge cycle', async () => {
    // Two nodes that each propose to absorb the other. Approving the first
    // merges A into B; the second one would leave the graph without a
    // survivor, so it is refused when it is applied.
    const first = await createNode('Cycle probe A');
    const second = await createNode('Cycle probe B');

    const intoSecond = await proposeMerge(first, second);
    expect(intoSecond.statusCode).toBe(201);
    createdProposalIds.push(intoSecond.json().id as string);

    const intoFirst = await proposeMerge(second, first);
    expect(intoFirst.statusCode).toBe(201);
    createdProposalIds.push(intoFirst.json().id as string);

    const approved = await approveProposal(intoSecond.json().id as string);
    expect(approved.statusCode).toBe(200);

    const refused = await approveProposal(intoFirst.json().id as string);
    expect(refused.statusCode).toBe(422);
    expect(refused.json().code).toBe('ERR_INVALID_STATE_TRANSITION');

    // The survivor is still alive.
    const rows = await tenantPool.query('select status from public.nodes where id = $1', [
      second,
    ]);
    expect(rows.rows[0].status).toBe('PENDING');
  });

  it('keeps the edit contract: a proposal without a kind is an edit', async () => {
    const nodeId = await createNode('Legacy edit probe');

    const response = await app!.inject({
      method: 'POST',
      url: '/api/v1/proposals',
      headers: {
        authorization: `Bearer ${maintainerToken}`,
        'x-workspace-id': workspaceId,
      },
      payload: {
        targetId: nodeId,
        targetType: 'NODE',
        proposedChanges: { title: 'A better title' },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().kind).toBe('EDIT');
    createdProposalIds.push(response.json().id as string);
  });
});
