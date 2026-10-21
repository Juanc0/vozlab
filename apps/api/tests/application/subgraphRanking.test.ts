import { describe, expect, it } from 'vitest';
import { GetSubgraphUseCase } from '../../src/application/use_cases/GetSubgraphUseCase.js';
import { Node } from '../../src/domain/entities/Node.js';
import { AuthorHash } from '../../src/domain/value_objects/AuthorHash.js';
import type { SubgraphEdge } from '../../src/domain/ports/INodeRepository.js';
import {
  makeDisplayNameCatalog,
  makeNodeRepository,
  makeOntologyRepository,
} from '../support/fakes.js';

/**
 * The ranking rule of the traversal (roadmap 3.20): "the nearest" is the
 * **strongest relation first, and among equals the most recent**.
 *
 * The unit suite proves the rule against the in-memory fake, which models the
 * adapter: the neighbours of a node are the relations that touch it, ranked
 * by `communityScore DESC` and then by `createdAt DESC`. The integration
 * suite proves the same rule against the real SQL.
 */

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
    'ACTIVE',
    0,
    instant,
    instant
  );
}

/** A relation with a strength and an instant: the two keys of the ranking. */
function relation(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  communityScore: number,
  createdAt = '2026-01-01T00:00:00.000Z'
): SubgraphEdge {
  return {
    id,
    sourceNodeId,
    targetNodeId,
    relationKey: 'RELATES_TO',
    attributes: {},
    authorHash: 'a'.repeat(64),
    status: 'ACTIVE',
    communityScore,
    createdAt: new Date(createdAt),
  };
}

/** The use case under test, with the catalog of the names wired in. */
function makeUseCase(nodes: Node[], edges: SubgraphEdge[]) {
  const { repo } = makeNodeRepository(nodes, { status: 'NOT_FOUND' }, edges);
  const ontology = makeOntologyRepository();
  return new GetSubgraphUseCase(repo, makeDisplayNameCatalog(ontology));
}

describe('the ranking rule of the subgraph', () => {
  it('returns the strongest relations when the hub has more neighbours than the limit', async () => {
    // A hub with six neighbours and a limit of three: the neighbourhood that
    // survives is the strongest one, not the first the index produced.
    const hub = node('hub', '2026-01-01T00:00:00.000Z');
    const neighbours = [
      node('weak', '2026-01-02T00:00:00.000Z'),
      node('strong', '2026-01-02T00:00:00.000Z'),
      node('medium', '2026-01-02T00:00:00.000Z'),
      node('weakest', '2026-01-02T00:00:00.000Z'),
      node('second', '2026-01-02T00:00:00.000Z'),
      node('third', '2026-01-02T00:00:00.000Z'),
    ];

    const useCase = makeUseCase([hub, ...neighbours], [
      relation('e-weak', 'hub', 'weak', 1),
      relation('e-strong', 'hub', 'strong', 100),
      relation('e-medium', 'hub', 'medium', 50),
      relation('e-weakest', 'hub', 'weakest', 0),
      relation('e-second', 'hub', 'second', 10),
      relation('e-third', 'hub', 'third', 5),
    ]);

    const result = await useCase.execute({
      rootId: 'hub',
      workspaceId: WS,
      tid: TID,
      depth: 1,
      limit: 3,
    });

    // The three strongest relations survive: the hub and its strongest
    // neighbours.
    expect(result.nodes.map((n) => n.node.id)).toEqual(['hub', 'strong', 'medium']);
    // The relations come back strongest first — and only the ones whose both
    // endpoints are inside the subgraph (the closed graph).
    expect(result.relations.map((r) => r.relation.id)).toEqual([
      'e-strong',
      'e-medium',
    ]);
  });

  it('breaks a tie of strength with the most recent relation', async () => {
    const hub = node('hub', '2026-01-01T00:00:00.000Z');
    const older = node('older', '2026-01-02T00:00:00.000Z');
    const newer = node('newer', '2026-01-02T00:00:00.000Z');

    const useCase = makeUseCase([hub, older, newer], [
      relation('e-older', 'hub', 'older', 7, '2026-01-01T00:00:00.000Z'),
      relation('e-newer', 'hub', 'newer', 7, '2026-06-01T00:00:00.000Z'),
    ]);

    const result = await useCase.execute({
      rootId: 'hub',
      workspaceId: WS,
      tid: TID,
      depth: 1,
      limit: 2,
    });

    // Same strength: the most recent relation wins.
    expect(result.nodes.map((n) => n.node.id)).toEqual(['hub', 'newer']);
    expect(result.relations.map((r) => r.relation.id)).toEqual(['e-newer']);
  });

  it('ranks the neighbours reached backwards with the same rule', async () => {
    // The hub is the *target* of the relations: the backward direction is
    // ranked like the forward one.
    const hub = node('hub', '2026-01-01T00:00:00.000Z');
    const strong = node('strong', '2026-01-02T00:00:00.000Z');
    const weak = node('weak', '2026-01-02T00:00:00.000Z');

    const useCase = makeUseCase([hub, strong, weak], [
      relation('e-weak', 'weak', 'hub', 1),
      relation('e-strong', 'strong', 'hub', 99),
    ]);

    const result = await useCase.execute({
      rootId: 'hub',
      workspaceId: WS,
      tid: TID,
      depth: 1,
      limit: 2,
    });

    expect(result.nodes.map((n) => n.node.id)).toEqual(['hub', 'strong']);
    expect(result.relations.map((r) => r.relation.id)).toEqual(['e-strong']);
  });

  it('never leaks a neighbour of another workspace', async () => {
    const hub = node('hub', '2026-01-01T00:00:00.000Z');
    const foreign = node('foreign', '2026-01-02T00:00:00.000Z', OTHER_WS);

    const useCase = makeUseCase([hub, foreign], [
      relation('e-foreign', 'hub', 'foreign', 100),
    ]);

    const result = await useCase.execute({
      rootId: 'hub',
      workspaceId: WS,
      tid: TID,
      depth: 1,
      limit: 10,
    });

    expect(result.nodes.map((n) => n.node.id)).toEqual(['hub']);
    expect(result.relations).toEqual([]);
  });
});
