import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { StartOidcLoginUseCase } from '../../src/application/use_cases/StartOidcLoginUseCase.js';
import { makeIdentityProvider, makeStateStore } from '../support/authFakes.js';

describe('StartOidcLoginUseCase', () => {
  it('stores single-use state and builds a PKCE S256 authorization URL', async () => {
    const { stateStore, saved } = makeStateStore();
    const { identityProvider, authUrlCalls } = makeIdentityProvider();
    const useCase = new StartOidcLoginUseCase(identityProvider, stateStore);

    const result = await useCase.execute({ redirectPath: '/proposals' });

    expect(saved).toHaveLength(1);
    const [{ state, data, ttl }] = saved;
    expect(ttl).toBe(600);
    expect(data.redirectPath).toBe('/proposals');
    expect(data.nonce).toBeTruthy();
    expect(data.codeVerifier).toBeTruthy();

    const expectedChallenge = createHash('sha256')
      .update(data.codeVerifier)
      .digest('base64url');
    expect(authUrlCalls).toHaveLength(1);
    expect(authUrlCalls[0]).toEqual({
      state,
      nonce: data.nonce,
      codeChallenge: expectedChallenge,
    });
    expect(result.authorizationUrl).toContain(encodeURIComponent(state));
  });

  it('rejects open-redirect paths and falls back to /', async () => {
    const { stateStore, saved } = makeStateStore();
    const { identityProvider } = makeIdentityProvider();
    const useCase = new StartOidcLoginUseCase(identityProvider, stateStore);

    await useCase.execute({ redirectPath: '//evil.example/steal' });
    await useCase.execute({ redirectPath: 'https://evil.example' });
    await useCase.execute({ redirectPath: '/\\evil.example/steal' });

    expect(saved.map((entry) => entry.data.redirectPath)).toEqual([
      '/',
      '/',
      '/',
    ]);
  });
});
