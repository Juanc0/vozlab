import { describe, expect, it } from 'vitest';
import { GetNodeWindowUseCase } from '../../src/application/use_cases/GetNodeWindowUseCase.js';
import { Node } from '../../src/domain/entities/Node.js';
import { AuthorHash } from '../../src/domain/value_objects/AuthorHash.js';
import type { SubgraphEdge } from '../../src/domain/ports/INodeRepository.js';
import { makeNodeRepository } from '../support/fakes.js';

const WS = 'ws-1';
const OTHER_WS = 'ws-2';
const TID = 'tenant-1';
const AUTHOR = AuthorHash.fromString('a'.repeat(64));

function node(id: string, createdAt: string, workspaceId = WS): Node {
  const instant = new Date(createdAt);
  return new Node(
    id,
    workspaceId,
    'Problem',
    `Node ${id}`,
    null,
    {},
    AUTHOR,
    'PENDING',
    0,
    instant,
    instant
  );
}

function edge(id: string, sourceNodeId: string, targetNodeId: string): SubgraphEdge {
  return {
    id,
    sourceNodeId,
    targetNodeId,
    relationKey: 'RELATES_TO',
    status: 'PENDING',
    communityScore: 0,
  };
}

describe('GetNodeWindowUseCase', () => {
  it('returns the most recent nodes of the workspace, newest first', async () => {
    const { repo } = makeNodeRepository([
      node('n-1', '2026-01-01T00:00:00.000Z'),
      node('n-3', '2026-01-03T00:00:00.000Z'),
      node('n-2', '2026-01-02T00:00:00.000Z'),
    ]);
    const useCase = new GetNodeWindowUseCase(repo);

    const result = await useCase.execute({ workspaceId: WS, tid: TID });

    expect(result.nodes.map((n) => n.id)).toEqual(['n-3', 'n-2', 'n-1']);
  });

  it('never leaks a node of another workspace', async () => {
    const { repo } = makeNodeRepository([
      node('mine', '2026-01-02T00:00:00.000Z'),
      node('foreign', '2026-01-03T00:00:00.000Z', OTHER_WS),
    ]);
    const useCase = new GetNodeWindowUseCase(repo);

    const result = await useCase.execute({ workspaceId: WS, tid: TID });

    expect(result.nodes.map((n) => n.id)).toEqual(['mine']);
  });

  it('returns only the relations whose both endpoints are in the window', async () => {
    const { repo } = makeNodeRepository(
      [
        node('n-1', '2026-01-03T00:00:00.000Z'),
        node('n-2', '2026-01-02T00:00:00.000Z'),
        node('n-3', '2026-01-01T00:00:00.000Z'),
      ],
      { status: 'NOT_FOUND' },
      [
        edge('e-inside', 'n-1', 'n-2'),
        edge('e-dangling', 'n-1', 'n-3'),
      ]
    );
    const useCase = new GetNodeWindowUseCase(repo);

    // The window holds the two newest nodes; `n-3` stays outside it.
    const result = await useCase.execute({ workspaceId: WS, tid: TID, limit: 2 });

    expect(result.nodes.map((n) => n.id)).toEqual(['n-1', 'n-2']);
    expect(result.edges.map((e) => e.id)).toEqual(['e-inside']);
  });

  it('clamps the limit to 1..200 and defaults to 100', async () => {
    const { repo, windowCalls } = makeNodeRepository([]);
    const useCase = new GetNodeWindowUseCase(repo);

    await useCase.execute({ workspaceId: WS, tid: TID });
    await useCase.execute({ workspaceId: WS, tid: TID, limit: 0 });
    await useCase.execute({ workspaceId: WS, tid: TID, limit: 1000 });

    expect(windowCalls.map((call) => call.limit)).toEqual([100, 1, 200]);
  });

  it('scopes the window to the workspace and the tenant', async () => {
    const { repo, windowCalls } = makeNodeRepository([]);
    const useCase = new GetNodeWindowUseCase(repo);

    await useCase.execute({ workspaceId: WS, tid: TID });

    expect(windowCalls[0]).toEqual({ workspaceId: WS, limit: 100, tid: TID });
  });

  it('answers an empty workspace with an empty window, not an error', async () => {
    const { repo } = makeNodeRepository([]);
    const useCase = new GetNodeWindowUseCase(repo);

    const result = await useCase.execute({ workspaceId: WS, tid: TID });

    expect(result).toEqual({ nodes: [], edges: [] });
  });
});
