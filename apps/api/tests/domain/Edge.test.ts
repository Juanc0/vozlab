import { describe, expect, it } from 'vitest';
import { Edge } from '../../src/domain/entities/Edge.js';
import { AuthorHash } from '../../src/domain/value_objects/AuthorHash.js';
import { DomainError } from '../../src/domain/errors/DomainError.js';

const authorHash = AuthorHash.fromIdentity('author-1', 'salt');

function makeEdge(status: Edge['status'] = 'PENDING'): Edge {
  return new Edge(
    'edge-1',
    'ws-1',
    'node-a',
    'node-b',
    'KNOWS',
    {},
    authorHash,
    status
  );
}

describe('Edge', () => {
  it('allows PENDING -> ACTIVE', () => {
    const edge = makeEdge('PENDING');
    edge.changeStatus('ACTIVE');
    expect(edge.status).toBe('ACTIVE');
  });

  it('rejects REJECTED -> ACTIVE with ERR_INVALID_STATE_TRANSITION', () => {
    const edge = makeEdge('REJECTED');
    try {
      edge.changeStatus('ACTIVE');
      expect.unreachable('expected changeStatus to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('ERR_INVALID_STATE_TRANSITION');
    }
    expect(edge.status).toBe('REJECTED');
  });

  it('no longer exposes softDelete (removed in TASK-24)', () => {
    const edge = makeEdge('ACTIVE');
    expect('softDelete' in edge).toBe(false);
  });
});
