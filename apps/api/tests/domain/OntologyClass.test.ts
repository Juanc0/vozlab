import { describe, expect, it } from 'vitest';
import { OntologyClass } from '../../src/domain/entities/OntologyClass.js';

function makeClass(): OntologyClass {
  return new OntologyClass('cls-1', 'ws-1', 'Problem', { en: 'Problem', es: 'Problema' });
}

describe('OntologyClass.canActivate', () => {
  it('returns true with at least 3 distinct supporters', () => {
    const cls = makeClass();
    expect(cls.canActivate(['a', 'b', 'c'])).toBe(true);
  });

  it('returns false with fewer than 3 distinct supporters', () => {
    const cls = makeClass();
    expect(cls.canActivate(['a', 'b'])).toBe(false);
  });

  it('collapses duplicate hashes', () => {
    const cls = makeClass();
    expect(cls.canActivate(['a', 'a', 'a'])).toBe(false);
    expect(cls.canActivate(['a', 'a', 'b', 'c'])).toBe(true);
  });

  it('honours a custom threshold', () => {
    const cls = makeClass();
    expect(cls.canActivate(['a', 'b'], 2)).toBe(true);
    expect(cls.canActivate(['a'], 2)).toBe(false);
  });
});
