import { describe, expect, it } from 'vitest';
import { AuthorHash } from '../../src/domain/value_objects/AuthorHash.js';

const HEX_64 = 'a'.repeat(64);

describe('AuthorHash', () => {
  it('fromString accepts a valid 64-hex pseudonym and normalizes case', () => {
    const hash = AuthorHash.fromString(HEX_64.toUpperCase());
    expect(hash.toString()).toBe(HEX_64);
  });

  it('fromString rejects a non-hash value', () => {
    expect(() => AuthorHash.fromString('not-a-hash')).toThrowError(/Invalid AuthorHash/);
  });

  it('isValid accepts only 64-hex strings', () => {
    expect(AuthorHash.isValid(HEX_64)).toBe(true);
    expect(AuthorHash.isValid('a'.repeat(63))).toBe(false);
    expect(AuthorHash.isValid('z'.repeat(64))).toBe(false);
  });

  it('equals compares the wrapped pseudonym', () => {
    expect(AuthorHash.fromString(HEX_64).equals(AuthorHash.fromString(HEX_64))).toBe(
      true
    );
    expect(AuthorHash.fromString(HEX_64).equals(AuthorHash.fromString('b'.repeat(64)))).toBe(
      false
    );
  });
});
