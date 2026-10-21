import { describe, expect, it } from 'vitest';
import { GetNodeNeighborsUseCase } from '../../src/application/use_cases/GetNodeNeighborsUseCase.js';
import { makeNodeRepository, makeOntologyRepository, makeDisplayNameCatalog } from '../support/fakes.js';

const WS = 'ws-1';
const tid = 'tenant-1';
const nodeId = 'node-1';

const source = {
  id: nodeId,
  typeKey: 'Problem',
  title: 'A title',
  description: 'A description',
  status: 'PENDING',
};

function makeUseCase(nearest: Parameters<typeof makeNodeRepository>[1]) {
  const { repo, nearestCalls } = makeNodeRepository([], nearest);
  const ontology = makeOntologyRepository();
  const useCase = new GetNodeNeighborsUseCase(repo, makeDisplayNameCatalog(ontology));
  return { useCase, nearestCalls };
}

describe('GetNodeNeighborsUseCase', () => {
  it('returns the source node and its neighbours', async () => {
    const { useCase } = makeUseCase({
      status: 'OK',
      source,
      neighbors: [
        {
          id: 'node-2',
          typeKey: 'Idea',
          title: 'Another title',
          description: null,
          status: 'ACTIVE',
          similarity: 0.91,
        },
      ],
    });

    const result = await useCase.execute({ nodeId, workspaceId: WS, tid });

    expect(result.source).toEqual({ ...source, typeDisplayNames: {} });
    expect(result.neighbors).toHaveLength(1);
    expect(result.neighbors[0].id).toBe('node-2');
    expect(result.neighbors[0].similarity).toBe(0.91);
    expect(result.neighbors[0].typeDisplayNames).toEqual({});
  });

  it('reports a missing node as ERR_NODE_NOT_FOUND', async () => {
    const { useCase } = makeUseCase({ status: 'NOT_FOUND' });

    await expect(
      useCase.execute({ nodeId, workspaceId: WS, tid })
    ).rejects.toMatchObject({ code: 'ERR_NODE_NOT_FOUND' });
  });

  it('reports a node without a vector as ERR_NODE_NOT_EMBEDDED', async () => {
    const { useCase } = makeUseCase({ status: 'NOT_EMBEDDED' });

    await expect(
      useCase.execute({ nodeId, workspaceId: WS, tid })
    ).rejects.toMatchObject({ code: 'ERR_NODE_NOT_EMBEDDED' });
  });

  it('clamps the limit to 1..10 and defaults to 5', async () => {
    const { useCase, nearestCalls } = makeUseCase({ status: 'OK', source, neighbors: [] });

    await useCase.execute({ nodeId, workspaceId: WS, tid });
    await useCase.execute({ nodeId, workspaceId: WS, tid, limit: 0 });
    await useCase.execute({ nodeId, workspaceId: WS, tid, limit: 99 });

    expect(nearestCalls.map((call) => call.limit)).toEqual([5, 1, 10]);
  });

  it('scopes the lookup to the workspace and the tenant', async () => {
    const { useCase, nearestCalls } = makeUseCase({ status: 'OK', source, neighbors: [] });

    await useCase.execute({ nodeId, workspaceId: WS, tid });

    expect(nearestCalls[0]).toEqual({ sourceId: nodeId, workspaceId: WS, limit: 5 });
  });
});
