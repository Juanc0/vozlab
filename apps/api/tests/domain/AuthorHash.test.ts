import { describe, expect, it } from 'vitest';
import { AuthorHash } from '../../src/domain/value_objects/AuthorHash.js';

const HEX_64 = 'a'.repeat(64);

describe('AuthorHash', () => {
  it('fromRawOrIdentity returns the input unchanged for a valid 64-hex value', () => {
    const hash = AuthorHash.fromRawOrIdentity(HEX_64, 'any-salt');
    expect(hash.toString()).toBe(HEX_64);
  });

  it('fromRawOrIdentity derives a stable SHA-256 from identity + salt otherwise', () => {
    const first = AuthorHash.fromRawOrIdentity('oidc-subject-1', 'salt-a');
    const second = AuthorHash.fromRawOrIdentity('oidc-subject-1', 'salt-a');
    expect(first.toString()).toBe(second.toString());
    expect(AuthorHash.isValid(first.toString())).toBe(true);
  });

  it('derives different hashes for different salts', () => {
    const a = AuthorHash.fromRawOrIdentity('oidc-subject-1', 'salt-a');
    const b = AuthorHash.fromRawOrIdentity('oidc-subject-1', 'salt-b');
    expect(a.toString()).not.toBe(b.toString());
  });

  it('fromString rejects a non-hash value', () => {
    expect(() => AuthorHash.fromString('not-a-hash')).toThrowError(/Invalid AuthorHash/);
  });
});
