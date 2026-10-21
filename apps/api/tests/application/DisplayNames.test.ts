/**
 * The names of the ontology in the answers of the graph.
 *
 * The API does not negotiate the language: it sends the **whole map** of the
 * display names of the class and of the relation, and the client picks the
 * name of its own language. The tests below are about the map, about the
 * scoping and about the absence of an N+1.
 */

import { describe, expect, it } from 'vitest';
import { GetEdgeUseCase } from '../../src/application/use_cases/GetEdgeUseCase.js';
import { GetNodeUseCase } from '../../src/application/use_cases/GetNodeUseCase.js';
import { GetNodeWindowUseCase } from '../../src/application/use_cases/GetNodeWindowUseCase.js';
import { GetSubgraphUseCase } from '../../src/application/use_cases/GetSubgraphUseCase.js';
import { ListEdgesUseCase } from '../../src/application/use_cases/ListEdgesUseCase.js';
import { ListNodesUseCase } from '../../src/application/use_cases/ListNodesUseCase.js';
import { Edge } from '../../src/domain/entities/Edge.js';
import { Node } from '../../src/domain/entities/Node.js';
import { OntologyClass } from '../../src/domain/entities/OntologyClass.js';
import { ObjectProperty } from '../../src/domain/entities/ObjectProperty.js';
import { AuthorHash } from '../../src/domain/value_objects/AuthorHash.js';
import type { SubgraphEdge } from '../../src/domain/ports/INodeRepository.js';
import {
  makeDisplayNameCatalog,
  makeEdgeRepository,
  makeNodeRepository,
  makeOntologyRepository,
} from '../support/fakes.js';

const WS = 'ws-1';
const OTHER_WS = 'ws-2';
const TID = 'tenant-1';
const AUTHOR = AuthorHash.fromString('a'.repeat(64));

const NAMES = { en: 'Problem', es: 'Problema' };
const RELATION_NAMES = { en: 'Relates to', es: 'Se relaciona con' };

function problemClass(workspaceId: string | null = WS, status: 'ACTIVE' | 'PROPOSED' = 'ACTIVE') {
  return new OntologyClass(
    'class-problem',
    workspaceId,
    'Problem',
    { ...NAMES },
    {},
    null,
    status
  );
}

function relatesToProperty(
  workspaceId: string | null = WS,
  status: 'ACTIVE' | 'PROPOSED' = 'ACTIVE'
) {
  return new ObjectProperty(
    'property-relates-to',
    workspaceId,
    'RELATES_TO',
    { ...RELATION_NAMES },
    {},
    'Problem',
    'Problem',
    true,
    false,
    false,
    status
  );
}

function node(id: string, typeKey = 'Problem', workspaceId = WS): Node {
  return new Node(
    id,
    workspaceId,
    typeKey,
    `Node ${id}`,
    null,
    {},
    AUTHOR,
    'PENDING',
    0,
    new Date('2026-01-01T00:00:00.000Z'),
    new Date('2026-01-01T00:00:00.000Z')
  );
}

function edge(id: string, relationKey = 'RELATES_TO'): Edge {
  return new Edge(
    id,
    WS,
    'node-a',
    'node-b',
    relationKey,
    {},
    AUTHOR,
    'PENDING'
  );
}

function subgraphEdge(
  id: string,
  relationKey = 'RELATES_TO',
  sourceNodeId = 'node-a',
  targetNodeId = 'node-b'
): SubgraphEdge {
  return {
    id,
    sourceNodeId,
    targetNodeId,
    relationKey,
    attributes: {},
    authorHash: 'a'.repeat(64),
    status: 'PENDING',
    communityScore: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('the names of the ontology in the answers of the graph', () => {
  it('carry the display names of the class of the node', async () => {
    const { repo } = makeNodeRepository([node('node-a')]);
    const ontology = makeOntologyRepository(null, [], [problemClass()]);
    const useCase = new GetNodeUseCase(repo, makeDisplayNameCatalog(ontology));

    const result = await useCase.execute({ nodeId: 'node-a', workspaceId: WS, tid: TID });

    expect(result.typeDisplayNames).toEqual(NAMES);
  });

  it('carry the display names of the relation of the edge', async () => {
    const { repo } = makeEdgeRepository();
    const ontology = makeOntologyRepository(null, [], [], [relatesToProperty()]);
    const useCase = new GetEdgeUseCase(repo, makeDisplayNameCatalog(ontology));
    const saved = edge('edge-a');
    await repo.save(saved, TID);

    const result = await useCase.execute({ edgeId: 'edge-a', workspaceId: WS, tid: TID });

    expect(result.relationDisplayNames).toEqual(RELATION_NAMES);
  });

  it('are an empty map — and no error — when the class is not in the ontology', async () => {
    const { repo } = makeNodeRepository([node('node-a', 'Unknown')]);
    const ontology = makeOntologyRepository(null, [], [problemClass()]);
    const useCase = new GetNodeUseCase(repo, makeDisplayNameCatalog(ontology));

    const result = await useCase.execute({ nodeId: 'node-a', workspaceId: WS, tid: TID });

    expect(result.typeDisplayNames).toEqual({});
  });

  it('are an empty map when the class is still a proposal', async () => {
    const { repo } = makeNodeRepository([node('node-a')]);
    const ontology = makeOntologyRepository(null, [], [problemClass(WS, 'PROPOSED')]);
    const useCase = new GetNodeUseCase(repo, makeDisplayNameCatalog(ontology));

    const result = await useCase.execute({ nodeId: 'node-a', workspaceId: WS, tid: TID });

    expect(result.typeDisplayNames).toEqual({});
  });

  it('never leak a class of another workspace', async () => {
    const { repo } = makeNodeRepository([node('node-a')]);
    const ontology = makeOntologyRepository(null, [], [problemClass(OTHER_WS)]);
    const useCase = new GetNodeUseCase(repo, makeDisplayNameCatalog(ontology));

    const result = await useCase.execute({ nodeId: 'node-a', workspaceId: WS, tid: TID });

    expect(result.typeDisplayNames).toEqual({});
    // Both reads of the metamodel are scoped to the workspace of the request.
    expect(ontology.reads.workspaces).toEqual([WS, WS]);
  });

  it('never leak a relation of another workspace', async () => {
    const { repo } = makeEdgeRepository();
    const ontology = makeOntologyRepository(null, [], [], [relatesToProperty(OTHER_WS)]);
    const useCase = new GetEdgeUseCase(repo, makeDisplayNameCatalog(ontology));
    await repo.save(edge('edge-a'), TID);

    const result = await useCase.execute({ edgeId: 'edge-a', workspaceId: WS, tid: TID });

    expect(result.relationDisplayNames).toEqual({});
  });

  it('reach the list of the nodes and the list of the relations', async () => {
    const nodes = makeNodeRepository([node('node-a')]);
    const edges = makeEdgeRepository();
    await edges.repo.save(edge('edge-a'), TID);
    const ontology = makeOntologyRepository(null, [], [problemClass()], [relatesToProperty()]);
    const names = makeDisplayNameCatalog(ontology);

    const listedNodes = await new ListNodesUseCase(nodes.repo, names).execute({
      workspaceId: WS,
      tid: TID,
      limit: 20,
    });
    const listedEdges = await new ListEdgesUseCase(edges.repo, names).execute({
      workspaceId: WS,
      tid: TID,
      limit: 20,
    });

    expect(listedNodes.items[0]?.typeDisplayNames).toEqual(NAMES);
    expect(listedEdges.items[0]?.relationDisplayNames).toEqual(RELATION_NAMES);
  });
});

describe('the absence of an N+1', () => {
  it('reads the names of the metamodel once for a window of two hundred nodes', async () => {
    const nodes = Array.from({ length: 200 }, (_, index) =>
      node(`node-${index}`, index % 2 === 0 ? 'Problem' : 'Idea')
    );
    const { repo } = makeNodeRepository(
      nodes,
      { status: 'NOT_FOUND' },
      Array.from({ length: 200 }, (_, index) =>
        subgraphEdge(`edge-${index}`, 'RELATES_TO', `node-${index}`, 'node-0')
      )
    );
    const ontology = makeOntologyRepository(null, [], [problemClass()], [relatesToProperty()]);
    const useCase = new GetNodeWindowUseCase(repo, makeDisplayNameCatalog(ontology));

    const result = await useCase.execute({ workspaceId: WS, tid: TID, limit: 200 });

    expect(result.nodes).toHaveLength(200);
    expect(result.relations).toHaveLength(200);
    // Two reads for two hundred nodes and two hundred relations: the names
    // are read once, not once per node.
    expect(ontology.reads.classes).toBe(1);
    expect(ontology.reads.properties).toBe(1);
  });

  it('reads the names of the metamodel once for a subgraph of two hundred nodes', async () => {
    const { repo } = makeNodeRepository(
      Array.from({ length: 200 }, (_, index) => node(`node-${index}`)),
      { status: 'NOT_FOUND' },
      Array.from({ length: 200 }, (_, index) =>
        subgraphEdge(`edge-${index}`, 'RELATES_TO', `node-${index}`, 'node-0')
      )
    );
    const ontology = makeOntologyRepository(null, [], [problemClass()], [relatesToProperty()]);
    const useCase = new GetSubgraphUseCase(repo, makeDisplayNameCatalog(ontology));

    const result = await useCase.execute({
      rootId: 'node-0',
      workspaceId: WS,
      tid: TID,
      depth: 1,
      limit: 200,
    });

    expect(ontology.reads.classes).toBe(1);
    expect(ontology.reads.properties).toBe(1);
    // Every node of the answer carries the names of its class.
    expect(result.nodes.every((named) => named.typeDisplayNames.en === 'Problem')).toBe(true);
    expect(
      result.relations.every((named) => named.relationDisplayNames.es === 'Se relaciona con')
    ).toBe(true);
  });
});
