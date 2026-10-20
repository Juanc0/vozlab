import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  expiryOf,
  forgetDevelopmentToken,
  looksLikeBearerToken,
  readRememberedDevelopmentToken,
  rememberDevelopmentToken
} from '$lib/auth/dev-sign-in';

const { envState } = vi.hoisted(() => ({
  envState: { isDevelopmentBuild: (): boolean => true }
}));
vi.mock('$lib/config/environment', () => envState);

/**
 * A token of the shape the API mints, with a payload that carries an `exp`.
 *
 * The payload is `{ "exp": 1893456000 }` — 2030-01-01T00:00:00Z — encoded in
 * base64url. It is **not** a valid signature: nothing here verifies a token,
 * the API is the authority.
 */
const TOKEN_WITH_EXPIRY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE4OTM0NTYwMDB9.c2lnbmF0dXJl';

describe('looksLikeBearerToken', () => {
  it('accepts a token of the three dot-separated parts', () => {
    expect(looksLikeBearerToken(TOKEN_WITH_EXPIRY)).toBe(true);
  });

  it('rejects a text that is not a token', () => {
    expect(looksLikeBearerToken('')).toBe(false);
    expect(looksLikeBearerToken('not a token')).toBe(false);
    expect(looksLikeBearerToken('only.two')).toBe(false);
    expect(looksLikeBearerToken('a.b.c.d')).toBe(false);
    expect(looksLikeBearerToken('..')).toBe(false);
  });
});

describe('the remembered development token', () => {
  beforeEach(() => {
    envState.isDevelopmentBuild = () => true;
    sessionStorage.clear();
  });

  it('keeps the token in the tab so a reload does not cost the role', () => {
    rememberDevelopmentToken(TOKEN_WITH_EXPIRY);

    expect(readRememberedDevelopmentToken()).toBe(TOKEN_WITH_EXPIRY);
  });

  it('forgets the token when the user signs out', () => {
    rememberDevelopmentToken(TOKEN_WITH_EXPIRY);
    forgetDevelopmentToken();

    expect(readRememberedDevelopmentToken()).toBeNull();
  });

  it('writes nothing outside a development build', () => {
    envState.isDevelopmentBuild = () => false;

    rememberDevelopmentToken(TOKEN_WITH_EXPIRY);

    expect(sessionStorage.length).toBe(0);
    expect(readRememberedDevelopmentToken()).toBeNull();
  });
});

describe('expiryOf', () => {
  it('reads the expiry claim out of the payload', () => {
    expect(expiryOf(TOKEN_WITH_EXPIRY)).toBe('2030-01-01T00:00:00.000Z');
  });

  it('assumes the default lifetime when the payload cannot be read', () => {
    const before = Date.now();
    const expiry = Date.parse(expiryOf('not.a.token'));

    // The API's default access-token lifetime is 15 minutes.
    expect(expiry).toBeGreaterThanOrEqual(before + 14 * 60 * 1000);
    expect(expiry).toBeLessThanOrEqual(before + 16 * 60 * 1000);
  });

  it('assumes the default lifetime when the payload has no expiry claim', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'abc' })).toString('base64url');
    const token = `aaa.${payload}.ccc`;

    expect(Number.isNaN(Date.parse(expiryOf(token)))).toBe(false);
  });

  it('survives a payload that is not JSON', () => {
    expect(Number.isNaN(Date.parse(expiryOf('aaa.bm90LWpzb24.ccc')))).toBe(false);
  });
});
