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

  // --- ADR-0026: the merge ---

  it('merges a PENDING node into the survivor', () => {
    const node = makeNode('PENDING');

    node.mergeInto('node-2');

    expect(node.status).toBe('MERGED');
    expect(node.mergedIntoId).toBe('node-2');
  });

  it('merges an ACTIVE node into the survivor', () => {
    const node = makeNode('ACTIVE');

    node.mergeInto('node-2');

    expect(node.status).toBe('MERGED');
    expect(node.mergedIntoId).toBe('node-2');
  });

  it('refuses to merge a node into itself', () => {
    const node = makeNode('PENDING');

    try {
      node.mergeInto('node-1');
      expect.unreachable('expected mergeInto to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('ERR_VALIDATION_FAILED');
    }
    expect(node.status).toBe('PENDING');
    expect(node.mergedIntoId).toBeNull();
  });

  it('refuses to merge a terminal node', () => {
    const node = makeNode('MERGED');

    try {
      node.mergeInto('node-2');
      expect.unreachable('expected mergeInto to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('ERR_INVALID_STATE_TRANSITION');
    }
    expect(node.mergedIntoId).toBeNull();
  });

  it('absorbs the attributes the survivor does not have', () => {
    const survivor = makeNode('ACTIVE');
    survivor.updateAttributes({ country: 'UK' });
    const duplicate = new Node(
      'node-2',
      'ws-1',
      'Person',
      'Ada Byron',
      null,
      { born: 1815, country: 'UK' },
      authorHash,
      'PENDING',
      7
    );

    survivor.absorb(duplicate);

    // The survivor's own value wins; the duplicate's extra key is adopted.
    expect(survivor.attributes).toEqual({ born: 1815, country: 'UK' });
    // The support for the duplicate carries over.
    expect(survivor.communityScore).toBe(7);
  });

  it('refuses to absorb itself', () => {
    const node = makeNode('ACTIVE');

    try {
      node.absorb(node);
      expect.unreachable('expected absorb to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('ERR_VALIDATION_FAILED');
    }
  });

  it('knows which states can be merged away', () => {
    expect(makeNode('PENDING').isMergeable).toBe(true);
    expect(makeNode('ACTIVE').isMergeable).toBe(true);
    expect(makeNode('MERGED').isMergeable).toBe(false);
    expect(makeNode('DEPRECATED').isMergeable).toBe(false);
    expect(makeNode('REJECTED').isMergeable).toBe(false);
  });

  // The adapter half of the contract — "persist `node.updatedAt` verbatim" —
  // is asserted for real in tests/infrastructure/timestampOwnership.test.ts
  // with a thin fake Drizzle client.
});
