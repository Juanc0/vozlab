import { describe, expect, it } from 'vitest';
import { EMBEDDING_DIMENSIONS } from '@vozlab/shared-types';
import { SetNodeEmbeddingUseCase } from '../../src/application/use_cases/SetNodeEmbeddingUseCase.js';
import { Node } from '../../src/domain/entities/Node.js';
import { makeNodeRepository } from '../support/fakes.js';
import { testHash } from '../support/hash.js';

const WS = 'ws-1';
const tid = 'tenant-1';
const MODEL = 'nomic-embed-text';
const authorHash = testHash('author-1');

function node(id: string, workspaceId: string): Node {
  return new Node(id, workspaceId, 'Problem', 'A title', null, {}, authorHash, 'PENDING');
}

function vector(dimensions = EMBEDDING_DIMENSIONS): number[] {
  return new Array(dimensions).fill(0.25);
}

function makeUseCase(nodes: Node[], expectedModel = MODEL) {
  const { repo, embeddings } = makeNodeRepository(nodes);
  return { useCase: new SetNodeEmbeddingUseCase(repo, expectedModel), embeddings };
}

const input = {
  nodeId: 'node-1',
  workspaceId: WS,
  embedding: vector(),
  model: MODEL,
  tid,
};

describe('SetNodeEmbeddingUseCase', () => {
  it('stores the vector for a node of the workspace', async () => {
    const { useCase, embeddings } = makeUseCase([node('node-1', WS)]);

    await useCase.execute(input);

    expect(embeddings).toHaveLength(1);
    expect(embeddings[0]).toMatchObject({
      id: 'node-1',
      workspaceId: WS,
      model: MODEL,
    });
    expect(embeddings[0].embedding).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it('reports a missing node as ERR_NODE_NOT_FOUND', async () => {
    const { useCase, embeddings } = makeUseCase([]);

    await expect(useCase.execute(input)).rejects.toMatchObject({
      code: 'ERR_NODE_NOT_FOUND',
    });
    expect(embeddings).toHaveLength(0);
  });

  it('reports a foreign-workspace node as ERR_NODE_NOT_FOUND', async () => {
    const { useCase, embeddings } = makeUseCase([node('node-1', 'ws-other')]);

    await expect(useCase.execute(input)).rejects.toMatchObject({
      code: 'ERR_NODE_NOT_FOUND',
    });
    expect(embeddings).toHaveLength(0);
  });

  it('rejects a model that is not the deployment model', async () => {
    const { useCase, embeddings } = makeUseCase([node('node-1', WS)]);

    await expect(
      useCase.execute({ ...input, model: 'other-model' })
    ).rejects.toMatchObject({ code: 'ERR_VALIDATION_FAILED' });
    expect(embeddings).toHaveLength(0);
  });

  it('rejects a vector with the wrong number of dimensions', async () => {
    const { useCase, embeddings } = makeUseCase([node('node-1', WS)]);

    await expect(
      useCase.execute({ ...input, embedding: vector(512) })
    ).rejects.toMatchObject({ code: 'ERR_VALIDATION_FAILED' });
    expect(embeddings).toHaveLength(0);
  });

  it('rejects a vector with non-finite values', async () => {
    const { useCase, embeddings } = makeUseCase([node('node-1', WS)]);
    const broken = vector();
    broken[3] = Number.NaN;

    await expect(useCase.execute({ ...input, embedding: broken })).rejects.toMatchObject({
      code: 'ERR_VALIDATION_FAILED',
    });
    expect(embeddings).toHaveLength(0);
  });
});
