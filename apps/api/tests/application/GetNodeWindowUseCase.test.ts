import { describe, expect, it } from 'vitest';
import { GetNodeWindowUseCase } from '../../src/application/use_cases/GetNodeWindowUseCase.js';
import { Node } from '../../src/domain/entities/Node.js';
import { AuthorHash } from '../../src/domain/value_objects/AuthorHash.js';
import type { SubgraphEdge } from '../../src/domain/ports/INodeRepository.js';
import {
  makeDisplayNameCatalog,
  makeNodeRepository,
  makeOntologyRepository,
} from '../support/fakes.js';

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
    attributes: {},
    authorHash: 'a'.repeat(64),
    status: 'PENDING',
    communityScore: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

/** The use case under test, with the catalog of the names wired in. */
function makeUseCase(
  nodes: Node[] = [],
  edges: SubgraphEdge[] = []
): {
  useCase: GetNodeWindowUseCase;
  reads: { classes: number; properties: number; workspaces: string[] };
  windowCalls: Array<{ workspaceId: string; limit: number; tid: string }>;
} {
  const { repo, windowCalls } = makeNodeRepository(nodes, { status: 'NOT_FOUND' }, edges);
  const ontology = makeOntologyRepository();
  const useCase = new GetNodeWindowUseCase(repo, makeDisplayNameCatalog(ontology));
  return { useCase, reads: ontology.reads, windowCalls };
}

describe('GetNodeWindowUseCase', () => {
  it('returns the most recent nodes of the workspace, newest first', async () => {
    const { useCase } = makeUseCase([
      node('n-1', '2026-01-01T00:00:00.000Z'),
      node('n-3', '2026-01-03T00:00:00.000Z'),
      node('n-2', '2026-01-02T00:00:00.000Z'),
    ]);

    const result = await useCase.execute({ workspaceId: WS, tid: TID });

    expect(result.nodes.map((n) => n.node.id)).toEqual(['n-3', 'n-2', 'n-1']);
  });

  it('never leaks a node of another workspace', async () => {
    const { useCase } = makeUseCase([
      node('mine', '2026-01-02T00:00:00.000Z'),
      node('foreign', '2026-01-03T00:00:00.000Z', OTHER_WS),
    ]);

    const result = await useCase.execute({ workspaceId: WS, tid: TID });

    expect(result.nodes.map((n) => n.node.id)).toEqual(['mine']);
  });

  it('returns only the relations whose both endpoints are in the window', async () => {
    const { useCase } = makeUseCase(
      [
        node('n-1', '2026-01-03T00:00:00.000Z'),
        node('n-2', '2026-01-02T00:00:00.000Z'),
        node('n-3', '2026-01-01T00:00:00.000Z'),
      ],
      [edge('e-inside', 'n-1', 'n-2'), edge('e-dangling', 'n-1', 'n-3')]
    );

    // The window holds the two newest nodes; `n-3` stays outside it.
    const result = await useCase.execute({ workspaceId: WS, tid: TID, limit: 2 });

    expect(result.nodes.map((n) => n.node.id)).toEqual(['n-1', 'n-2']);
    expect(result.relations.map((e) => e.relation.id)).toEqual(['e-inside']);
  });

  it('clamps the limit to 1..200 and defaults to 100', async () => {
    const { useCase, windowCalls } = makeUseCase();

    await useCase.execute({ workspaceId: WS, tid: TID });
    await useCase.execute({ workspaceId: WS, tid: TID, limit: 0 });
    await useCase.execute({ workspaceId: WS, tid: TID, limit: 1000 });

    expect(windowCalls.map((call) => call.limit)).toEqual([100, 1, 200]);
  });

  it('scopes the window to the workspace and the tenant', async () => {
    const { useCase, windowCalls } = makeUseCase();

    await useCase.execute({ workspaceId: WS, tid: TID });

    expect(windowCalls[0]).toEqual({ workspaceId: WS, limit: 100, tid: TID });
  });

  it('answers an empty workspace with an empty window, not an error', async () => {
    const { useCase } = makeUseCase();

    const result = await useCase.execute({ workspaceId: WS, tid: TID });

    expect(result).toEqual({ nodes: [], relations: [] });
  });

  it('reads the names of the metamodel once, whatever the number of nodes is', async () => {
    const nodes = Array.from({ length: 200 }, (_, index) =>
      node(`n-${index}`, `2026-01-01T00:00:${String(index % 60).padStart(2, '0')}.000Z`)
    );
    const { useCase, reads } = makeUseCase(nodes);

    await useCase.execute({ workspaceId: WS, tid: TID, limit: 200 });

    // Two reads of the metamodel for two hundred nodes: the names are not
    // read per node.
    expect(reads.classes).toBe(1);
    expect(reads.properties).toBe(1);
    expect(reads.workspaces).toEqual([WS, WS]);
  });
});
