import { testHash } from '../support/hash.js';
import { describe, expect, it } from 'vitest';
import { DeleteNodeUseCase } from '../../src/application/use_cases/DeleteNodeUseCase.js';
import { Node } from '../../src/domain/entities/Node.js';
import { AuthorHash } from '../../src/domain/value_objects/AuthorHash.js';
import { makeEventPublisher, makeNodeRepository } from '../support/fakes.js';

const WS = 'ws-1';
const tid = 'tenant-1';
const authorHash = testHash('author-1');

function node(id: string, workspaceId: string, author: AuthorHash): Node {
  return new Node(id, workspaceId, 'Problem', 'A title', null, {}, author, 'ACTIVE');
}

function makeUseCase(nodes: Node[]) {
  const { repo, softDeleted } = makeNodeRepository(nodes);
  const { publisher, events } = makeEventPublisher();
  return { useCase: new DeleteNodeUseCase(repo, publisher), softDeleted, events };
}

const input = { nodeId: 'node-1', workspaceId: WS, tid, authorHash: authorHash.toString() };

describe('DeleteNodeUseCase', () => {
  it('soft-deletes the author-owned node and publishes', async () => {
    const { useCase, softDeleted, events } = makeUseCase([node('node-1', WS, authorHash)]);

    await useCase.execute(input);

    expect(softDeleted).toEqual(['node-1']);
    expect(events).toEqual(['NODE_DELETED']);
  });

  it('reports a missing node as ERR_NODE_NOT_FOUND', async () => {
    const { useCase, softDeleted } = makeUseCase([]);

    await expect(useCase.execute(input)).rejects.toMatchObject({ code: 'ERR_NODE_NOT_FOUND' });
    expect(softDeleted).toEqual([]);
  });

  it('reports a foreign-workspace node as ERR_NODE_NOT_FOUND', async () => {
    const { useCase, softDeleted } = makeUseCase([node('node-1', 'ws-other', authorHash)]);

    await expect(useCase.execute(input)).rejects.toMatchObject({ code: 'ERR_NODE_NOT_FOUND' });
    expect(softDeleted).toEqual([]);
  });

  it('rejects a non-author with ERR_AUTHORIZATION_FAILED and does not delete', async () => {
    const other = testHash('someone-else');
    const { useCase, softDeleted } = makeUseCase([node('node-1', WS, other)]);

    await expect(useCase.execute(input)).rejects.toMatchObject({ code: 'ERR_AUTHORIZATION_FAILED' });
    expect(softDeleted).toEqual([]);
  });
});
