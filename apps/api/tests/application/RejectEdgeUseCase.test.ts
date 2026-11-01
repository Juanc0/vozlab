import { describe, expect, it } from 'vitest';

import { RejectEdgeUseCase } from '../../src/application/use_cases/RejectEdgeUseCase.js';
import { Edge } from '../../src/domain/entities/Edge.js';
import type { EdgeStatus } from '../../src/domain/entities/Edge.js';
import { DomainError } from '../../src/domain/errors/DomainError.js';
import { makeEventPublisher, makeEdgeRepository, makeUnitOfWork } from '../support/fakes.js';
import { testHash } from '../support/hash.js';

const WS = 'ws-1';
const tid = 'tenant-1';
const authorHash = testHash('author-1');
const otherHash = testHash('someone-else');
const modHash = testHash('moderator');

function edge(id: string, workspaceId: string, author: typeof authorHash, status: EdgeStatus = 'PENDING'): Edge {
  return new Edge(id, workspaceId, 'node-a', 'node-b', 'KNOWS', {}, author, status);
}

function makeRoles(roles: string[]) {
  return {
    async getRole() {
      return roles[0] ?? null;
    },
    async getRoles() {
      return roles;
    },
    async isMember() {
      return roles.length > 0;
    },
    async add() {},
    async changeRole() {},
    async suspend() {},
    async reactivate() {},
    async remove() {},
  };
}

function build(edges: Edge[], roles: string[]) {
  const { repo, statusUpdates } = makeEdgeRepository(edges);
  const membershipRepo = makeRoles(roles) as never;
  const { uow, ran } = makeUnitOfWork();
  const { publisher, events } = makeEventPublisher();
  const useCase = new RejectEdgeUseCase(repo, membershipRepo, uow, publisher);
  return { useCase, statusUpdates, ran, events };
}

const baseInput = {
  edgeId: 'edge-1',
  workspaceId: WS,
  tid,
  resolverUserId: 'user-1',
};

describe('RejectEdgeUseCase', () => {
  it('lets the author reject their own pending edge', async () => {
    const { useCase, statusUpdates, ran, events } = build(
      [edge('edge-1', WS, authorHash)],
      []
    );
    const result = await useCase.execute({
      ...baseInput,
      resolverHash: authorHash.toString(),
    });
    expect(result.status).toBe('REJECTED');
    expect(statusUpdates).toHaveLength(1);
    expect(statusUpdates[0]).toMatchObject({ id: 'edge-1', status: 'REJECTED', tid });
    expect(ran.count).toBe(1);
    expect(events).toEqual(['EDGE_REJECTED']);
  });

  it('lets a moderator reject another user edge', async () => {
    const { useCase, statusUpdates, events } = build(
      [edge('edge-1', WS, otherHash)],
      ['MODERATOR']
    );
    const result = await useCase.execute({
      ...baseInput,
      resolverHash: modHash.toString(),
    });
    expect(result.status).toBe('REJECTED');
    expect(statusUpdates).toHaveLength(1);
    expect(events).toEqual(['EDGE_REJECTED']);
  });

  it('rejects a non-author non-moderator', async () => {
    const { useCase, statusUpdates, events } = build(
      [edge('edge-1', WS, otherHash)],
      ['MEMBER']
    );
    await expect(
      useCase.execute({ ...baseInput, resolverHash: modHash.toString() })
    ).rejects.toMatchObject({ code: 'ERR_AUTHORIZATION_FAILED' });
    expect(statusUpdates).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('reports a missing edge as ERR_EDGE_NOT_FOUND', async () => {
    const { useCase, statusUpdates } = build([], []);
    await expect(
      useCase.execute({ ...baseInput, resolverHash: authorHash.toString() })
    ).rejects.toMatchObject({ code: 'ERR_EDGE_NOT_FOUND' });
    expect(statusUpdates).toHaveLength(0);
  });

  it('reports an already-rejected edge as ERR_INVALID_STATE_TRANSITION', async () => {
    const { useCase, statusUpdates } = build(
      [edge('edge-1', WS, authorHash, 'REJECTED')],
      []
    );
    await expect(
      useCase.execute({ ...baseInput, resolverHash: authorHash.toString() })
    ).rejects.toMatchObject({ code: 'ERR_INVALID_STATE_TRANSITION' });
    expect(statusUpdates).toHaveLength(0);
  });

  it('reports a foreign-workspace edge as ERR_EDGE_NOT_FOUND', async () => {
    const { useCase, statusUpdates } = build(
      [edge('edge-1', 'ws-other', authorHash)],
      []
    );
    await expect(
      useCase.execute({ ...baseInput, resolverHash: authorHash.toString() })
    ).rejects.toMatchObject({ code: 'ERR_EDGE_NOT_FOUND' });
    expect(statusUpdates).toHaveLength(0);
  });
});