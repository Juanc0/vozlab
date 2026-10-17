import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../../src/infrastructure/persistence/keyset.js';

describe('keyset cursor', () => {
  it('round-trips createdAt (same ms) and id', () => {
    const createdAt = new Date('2026-01-02T03:04:05.678Z');
    const decoded = decodeCursor(encodeCursor(createdAt, 'node-42'));

    expect(decoded).not.toBeNull();
    expect(decoded!.createdAt.getTime()).toBe(createdAt.getTime());
    expect(decoded!.id).toBe('node-42');
  });

  it('returns null for malformed cursors', () => {
    expect(decodeCursor('')).toBeNull();
    expect(decodeCursor('not|base64!!')).toBeNull();
    expect(decodeCursor(Buffer.from('garbage', 'utf8').toString('base64'))).toBeNull();
  });
});
