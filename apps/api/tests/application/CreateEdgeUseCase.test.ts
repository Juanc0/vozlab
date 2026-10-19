import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/shared/config/env.js', () => ({
  env: { AUTHOR_HASH_SALT: 'test-author-hash-salt-12345' },
}));

import { CreateEdgeUseCase } from '../../src/application/use_cases/CreateEdgeUseCase.js';
import { Node } from '../../src/domain/entities/Node.js';
import { AuthorHash } from '../../src/domain/value_objects/AuthorHash.js';
import {
  makeEdgeRepository,
  makeEventPublisher,
  makeNodeRepository,
  makeOntologyRepository,
} from '../support/fakes.js';

const WS = 'ws-1';
const tid = 'tenant-1';
const authorHash = AuthorHash.fromIdentity('author-1', 'salt').toString();

function node(id: string, workspaceId: string): Node {
  return new Node(id, workspaceId, 'Problem', 'A title', null, {}, AuthorHash.fromIdentity('author-1', 'salt'), 'ACTIVE');
}

function makeUseCase(source: Node | null, target: Node | null) {
  const nodeRepo = makeNodeRepository(source && target ? [source, target] : source ? [source] : target ? [target] : []);
  const edgeRepo = makeEdgeRepository();
  const { repo: ontologyRepo } = makeOntologyRepository(null);
  const { publisher, events } = makeEventPublisher();
  const useCase = new CreateEdgeUseCase(edgeRepo.repo, nodeRepo.repo, ontologyRepo, publisher);
  return { useCase, edgeRepo, events };
}

const input = {
  sourceNodeId: 'node-src',
  targetNodeId: 'node-tgt',
  relationKey: 'RELATES_TO',
  attributes: {},
  workspaceId: WS,
  tid,
  authorHash,
};

describe('CreateEdgeUseCase', () => {
  it('persists the edge and publishes when both endpoints share the workspace', async () => {
    const { useCase, edgeRepo, events } = makeUseCase(node('node-src', WS), node('node-tgt', WS));

    const edge = await useCase.execute(input);

    expect(edgeRepo.saved).toHaveLength(1);
    expect(edgeRepo.saved[0]).toBe(edge);
    expect(edge.sourceNodeId).toBe('node-src');
    expect(edge.targetNodeId).toBe('node-tgt');
    expect(events).toEqual(['EDGE_CREATED']);
  });

  it('rejects ERR_NODE_NOT_FOUND when the source is in another workspace', async () => {
    const { useCase, edgeRepo } = makeUseCase(node('node-src', 'ws-other'), node('node-tgt', WS));

    await expect(useCase.execute(input)).rejects.toMatchObject({ code: 'ERR_NODE_NOT_FOUND' });
    expect(edgeRepo.saved).toHaveLength(0);
  });

  it('rejects ERR_NODE_NOT_FOUND when the target is in another workspace', async () => {
    const { useCase, edgeRepo } = makeUseCase(node('node-src', WS), node('node-tgt', 'ws-other'));

    await expect(useCase.execute(input)).rejects.toMatchObject({ code: 'ERR_NODE_NOT_FOUND' });
    expect(edgeRepo.saved).toHaveLength(0);
  });

  it('rejects ERR_NODE_NOT_FOUND when an endpoint is missing', async () => {
    const { useCase, edgeRepo } = makeUseCase(node('node-src', WS), null);

    await expect(useCase.execute(input)).rejects.toMatchObject({ code: 'ERR_NODE_NOT_FOUND' });
    expect(edgeRepo.saved).toHaveLength(0);
  });
});
