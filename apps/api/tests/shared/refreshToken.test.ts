import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  generateAuthorHash,
  generateRefreshToken,
  hashEmail,
  hashOpaqueToken,
  parseRefreshToken,
} from '../../src/shared/auth/refreshToken.js';
import { durationToMs } from '../../src/shared/time/duration.js';
import { TENANT_ID } from '../support/authFakes.js';

describe('refresh token utilities', () => {
  it('generates v1.<tenant>.<64 hex> and parses the tenant', () => {
    const token = generateRefreshToken(TENANT_ID);

    expect(token).toMatch(
      new RegExp(`^v1\\.${TENANT_ID}\\.[a-f0-9]{64}$`)
    );
    expect(parseRefreshToken(token)).toEqual({ tenantId: TENANT_ID });
  });

  it('rejects malformed, tampered or unknown-version tokens', () => {
    const token = generateRefreshToken(TENANT_ID);
    const [, tenant, secret] = token.split('.');

    expect(parseRefreshToken('')).toBeNull();
    expect(parseRefreshToken('v2.' + tenant + '.' + secret)).toBeNull();
    expect(parseRefreshToken('v1.not-a-uuid.' + secret)).toBeNull();
    expect(parseRefreshToken('v1.' + tenant + '.short')).toBeNull();
    expect(parseRefreshToken(token + '.extra')).toBeNull();
    expect(parseRefreshToken('v1.' + tenant)).toBeNull();
  });

  it('hashes deterministically without storing the raw token', () => {
    const token = generateRefreshToken(TENANT_ID);
    const hash = hashOpaqueToken(token);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(hashOpaqueToken(token));
    expect(hash).not.toBe(token);
    expect(hash).not.toBe(hashOpaqueToken(generateRefreshToken(TENANT_ID)));
  });

  it('generates a 64-hex random author pseudonym', () => {
    const first = generateAuthorHash();
    const second = generateAuthorHash();

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
  });
});

describe('hashEmail (DEC-4 peppered email hash)', () => {
  const PEPPER = 'pepper-secret-value-with-at-least-32-chars';
  const OTHER_PEPPER = 'a-different-pepper-also-at-least-32-chars!!';

  it('is deterministic for the same input', () => {
    const first = hashEmail('foo@bar.com', PEPPER);
    const second = hashEmail('foo@bar.com', PEPPER);

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(second);
  });

  it('normalizes with trim + lowercase before hashing', () => {
    expect(hashEmail('  Foo@Bar.COM ', PEPPER)).toBe(
      hashEmail('foo@bar.com', PEPPER)
    );
  });

  it('hashes UTF-8 mailboxes safely and keeps them distinct', () => {
    const utf = hashEmail('üser@exämple.de', PEPPER);

    expect(utf).toMatch(/^[a-f0-9]{64}$/);
    expect(utf).toBe(hashEmail('ÜSER@EXÄMPLE.DE', PEPPER));
    expect(utf).not.toBe(hashEmail('user@example.de', PEPPER));
  });

  it('produces a different digest for a different pepper', () => {
    expect(hashEmail('foo@bar.com', PEPPER)).not.toBe(
      hashEmail('foo@bar.com', OTHER_PEPPER)
    );
  });

  it('matches the documented HMAC-SHA-256 construction', () => {
    const expected = createHmac('sha256', PEPPER)
      .update('foo@bar.com', 'utf8')
      .digest('hex');

    expect(hashEmail('foo@bar.com', PEPPER)).toBe(expected);
  });
});

describe('durationToMs', () => {
  it.each([
    ['1s', 1_000],
    ['15m', 900_000],
    ['12h', 43_200_000],
    ['30d', 2_592_000_000],
    ['1w', 604_800_000],
  ])('parses %s', (value, expected) => {
    expect(durationToMs(value)).toBe(expected);
  });

  it('trims surrounding whitespace', () => {
    expect(durationToMs(' 10m ')).toBe(600_000);
  });

  it.each(['15', '0m', '-1m', '1y', 'abc'])('rejects %s', (value) => {
    expect(() => durationToMs(value)).toThrow();
  });
});
