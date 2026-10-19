import { DomainError } from '../../src/domain/errors/DomainError.js';
import { testHash } from '../support/hash.js';
import { describe, expect, it } from 'vitest';
import { Node } from '../../src/domain/entities/Node.js';

const authorHash = testHash('author-1');

function makeNode(status: Node['status'] = 'DRAFT'): Node {
  return new Node(
    'node-1',
    'ws-1',
    'Person',
    'Ada Lovelace',
    null,
    { born: 1815 },
    authorHash,
    status
  );
}

describe('Node', () => {
  it('allows DRAFT -> PENDING and DRAFT -> ACTIVE', () => {
    const toPending = makeNode('DRAFT');
    toPending.changeStatus('PENDING');
    expect(toPending.status).toBe('PENDING');

    const toActive = makeNode('DRAFT');
    toActive.changeStatus('ACTIVE');
    expect(toActive.status).toBe('ACTIVE');
  });

  it('rejects REJECTED -> ACTIVE with ERR_INVALID_STATE_TRANSITION', () => {
    const node = makeNode('REJECTED');
    try {
      node.changeStatus('ACTIVE');
      expect.unreachable('expected changeStatus to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('ERR_INVALID_STATE_TRANSITION');
    }
    expect(node.status).toBe('REJECTED');
  });

  it('bumps updatedAt on changeStatus (domain is the single writer)', () => {
    const node = makeNode('DRAFT');
    const before = node.updatedAt;

    node.changeStatus('ACTIVE');

    expect(node.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('merges attribute deltas and bumps updatedAt', () => {
    const node = makeNode('ACTIVE');
    const before = node.updatedAt;

    node.updateAttributes({ born: 1816, country: 'UK' });

    expect(node.attributes).toEqual({ born: 1816, country: 'UK' });
    expect(node.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  // The adapter half of the contract — "persist `node.updatedAt` verbatim" —
  // is asserted for real in tests/infrastructure/timestampOwnership.test.ts
  // with a thin fake Drizzle client.
});
