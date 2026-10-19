import { describe, expect, it } from 'vitest';
import { LogoutUseCase } from '../../src/application/use_cases/LogoutUseCase.js';
import {
  generateRefreshToken,
  hashOpaqueToken,
} from '../../src/shared/auth/refreshToken.js';
import {
  TENANT,
  TENANT_ID,
  makeRefreshTokenRepository,
  makeRouterDb,
  makeTokenBlacklist,
} from '../support/authFakes.js';

function setup(options: { byId?: typeof TENANT | null } = {}) {
  const { blacklist, revoked } = makeTokenBlacklist();
  const router = makeRouterDb({
    byId: options.byId === undefined ? TENANT : options.byId,
  });
  const refresh = makeRefreshTokenRepository();
  const useCase = new LogoutUseCase(
    blacklist,
    router.routerDb,
    refresh.refreshRepo
  );
  return { useCase, revoked, refresh, router };
}

describe('LogoutUseCase', () => {
  it('blacklists the access jti for its remaining lifetime and revokes the refresh family', async () => {
    const { useCase, revoked, refresh } = setup();
    const refreshToken = generateRefreshToken(TENANT_ID);
    const tokenExpiresAt = Math.floor(Date.now() / 1000) + 300;

    await useCase.execute({ jti: 'jti-1', tokenExpiresAt, refreshToken });

    expect(revoked).toHaveLength(1);
    expect(revoked[0].jti).toBe('jti-1');
    expect(revoked[0].ttlSeconds).toBeGreaterThan(295);
    expect(revoked[0].ttlSeconds).toBeLessThanOrEqual(300);

    expect(refresh.revokedHashes).toEqual([hashOpaqueToken(refreshToken)]);
  });

  it('does not blacklist an already-expired access token', async () => {
    const { useCase, revoked, refresh } = setup();

    await useCase.execute({
      jti: 'jti-1',
      tokenExpiresAt: Math.floor(Date.now() / 1000) - 1,
    });

    expect(revoked).toEqual([]);
    expect(refresh.revokedHashes).toEqual([]);
  });

  it('ignores malformed refresh tokens and missing access metadata', async () => {
    const { useCase, revoked, refresh, router } = setup();

    await useCase.execute({ refreshToken: 'garbage' });
    await useCase.execute({});

    expect(revoked).toEqual([]);
    expect(refresh.revokedHashes).toEqual([]);
    expect(router.calls).toEqual([]);
  });

  it('does not revoke a refresh family for an unknown tenant', async () => {
    const { useCase, refresh } = setup({ byId: null });

    await useCase.execute({ refreshToken: generateRefreshToken(TENANT_ID) });

    expect(refresh.revokedHashes).toEqual([]);
  });

  it('still revokes the refresh family when the blacklist write fails', async () => {
    const router = makeRouterDb({ byId: TENANT });
    const refresh = makeRefreshTokenRepository();
    const useCase = new LogoutUseCase(
      {
        async isBlacklisted() {
          return false;
        },
        async revoke() {
          throw new Error('redis down');
        },
      },
      router.routerDb,
      refresh.refreshRepo
    );
    const refreshToken = generateRefreshToken(TENANT_ID);

    await useCase.execute({
      jti: 'jti-1',
      tokenExpiresAt: Math.floor(Date.now() / 1000) + 300,
      refreshToken,
    });

    expect(refresh.revokedHashes).toEqual([hashOpaqueToken(refreshToken)]);
  });
});
