import { describe, expect, it } from 'vitest';

import { AutoActivateEdgeUseCase } from '../../src/application/use_cases/AutoActivateEdgeUseCase.js';
import { Edge } from '../../src/domain/entities/Edge.js';
import { DomainError } from '../../src/domain/errors/DomainError.js';
import { makeEdgeRepository, makeEventPublisher, makeUnitOfWork } from '../support/fakes.js';
import { testHash } from '../support/hash.js';

const WS = 'ws-1';
const tid = 'tenant-1';
const authorHash = testHash('author-1');
const otherHash = testHash('someone-else');
const modHash = testHash('moderator');

const OLD_DATE = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

function edge(
  id: string,
  workspaceId: string,
  author: typeof authorHash,
  status: 'PENDING' | 'ACTIVE' = 'PENDING',
  communityScore = 10,
  createdAt: Date = OLD_DATE
): Edge {
  return new Edge(id, workspaceId, 'n-1', 'n-2', 'RELATES_TO', {}, author, status, communityScore, createdAt);
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
  const useCase = new AutoActivateEdgeUseCase(repo, membershipRepo, uow, publisher);
  return { useCase, statusUpdates, ran, events };
}

const baseInput = {
  edgeId: 'edge-1',
  workspaceId: WS,
  tid,
  resolverUserId: 'user-1',
};

describe('AutoActivateEdgeUseCase', () => {
  it('activates a pending edge when criteria are met', async () => {
    const { useCase, statusUpdates, ran, events } = build(
      [edge('edge-1', WS, otherHash)],
      ['MODERATOR']
    );
    const result = await useCase.execute({
      ...baseInput,
      resolverHash: modHash.toString(),
    });
    expect(result.status).toBe('ACTIVE');
    expect(statusUpdates).toHaveLength(1);
    expect(statusUpdates[0]).toMatchObject({ id: 'edge-1', status: 'ACTIVE', tid });
    expect(ran.count).toBe(1);
    expect(events).toEqual(['EDGE_AUTO_ACTIVATED']);
  });

  it('rejects when criteria are unmet (ERR_UNMET_AUTO_APPLY_CRITERIA)', async () => {
    const { useCase, statusUpdates, events } = build(
      [edge('edge-1', WS, otherHash, 'PENDING', 0)],
      ['MODERATOR']
    );
    await expect(
      useCase.execute({ ...baseInput, resolverHash: modHash.toString() })
    ).rejects.toMatchObject({ code: 'ERR_UNMET_AUTO_APPLY_CRITERIA' });
    expect(statusUpdates).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('activates when score is exactly 10 and age is exactly 14 days', async () => {
    const exactlyFourteenDays = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const { useCase, statusUpdates, ran, events } = build(
      [edge('edge-1', WS, otherHash, 'PENDING', 10, exactlyFourteenDays)],
      ['MODERATOR']
    );
    const result = await useCase.execute({
      ...baseInput,
      resolverHash: modHash.toString(),
    });
    expect(result.status).toBe('ACTIVE');
    expect(statusUpdates).toHaveLength(1);
    expect(ran.count).toBe(1);
    expect(events).toEqual(['EDGE_AUTO_ACTIVATED']);
  });

  it('rejects when community score is 9 (below threshold)', async () => {
    const { useCase, statusUpdates, events } = build(
      [edge('edge-1', WS, otherHash, 'PENDING', 9)],
      ['MODERATOR']
    );
    await expect(
      useCase.execute({ ...baseInput, resolverHash: modHash.toString() })
    ).rejects.toMatchObject({ code: 'ERR_UNMET_AUTO_APPLY_CRITERIA' });
    expect(statusUpdates).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('rejects when age is 13 days (below threshold)', async () => {
    const thirteenDays = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
    const { useCase, statusUpdates, events } = build(
      [edge('edge-1', WS, otherHash, 'PENDING', 10, thirteenDays)],
      ['MODERATOR']
    );
    await expect(
      useCase.execute({ ...baseInput, resolverHash: modHash.toString() })
    ).rejects.toMatchObject({ code: 'ERR_UNMET_AUTO_APPLY_CRITERIA' });
    expect(statusUpdates).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('rejects a non-moderator (ERR_AUTHORIZATION_FAILED)', async () => {
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
    const { useCase, statusUpdates } = build([], ['MODERATOR']);
    await expect(
      useCase.execute({ ...baseInput, resolverHash: modHash.toString() })
    ).rejects.toMatchObject({ code: 'ERR_EDGE_NOT_FOUND' });
    expect(statusUpdates).toHaveLength(0);
  });

  it('reports an already-active edge as ERR_INVALID_STATE_TRANSITION', async () => {
    const { useCase, statusUpdates } = build(
      [edge('edge-1', WS, authorHash, 'ACTIVE')],
      ['MODERATOR']
    );
    await expect(
      useCase.execute({ ...baseInput, resolverHash: modHash.toString() })
    ).rejects.toMatchObject({ code: 'ERR_INVALID_STATE_TRANSITION' });
    expect(statusUpdates).toHaveLength(0);
  });

  it('reports a foreign-workspace edge as ERR_EDGE_NOT_FOUND', async () => {
    const { useCase, statusUpdates } = build(
      [edge('edge-1', 'ws-other', otherHash)],
      ['MODERATOR']
    );
    await expect(
      useCase.execute({ ...baseInput, resolverHash: modHash.toString() })
    ).rejects.toMatchObject({ code: 'ERR_EDGE_NOT_FOUND' });
    expect(statusUpdates).toHaveLength(0);
  });
});