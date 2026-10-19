import { describe, expect, it } from 'vitest';
import { RefreshSessionUseCase } from '../../src/application/use_cases/RefreshSessionUseCase.js';
import type { RotateRefreshTokenResult } from '../../src/domain/ports/IRefreshTokenRepository.js';
import {
  generateRefreshToken,
  hashOpaqueToken,
  parseRefreshToken,
} from '../../src/shared/auth/refreshToken.js';
import {
  AUTH_USER,
  AUTHOR_HASH,
  TENANT,
  TENANT_ID,
  TENANT_KEY,
  makeRefreshTokenRepository,
  makeRouterDb,
  makeTokenIssuer,
  makeUserRepository,
} from '../support/authFakes.js';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function setup(
  options: {
    rotation?: RotateRefreshTokenResult;
    user?: typeof AUTH_USER | null;
    byId?: typeof TENANT | null;
  } = {}
) {
  const router = makeRouterDb({
    byId: options.byId === undefined ? TENANT : options.byId,
  });
  const users = makeUserRepository({
    user: options.user === undefined ? AUTH_USER : options.user,
  });
  const refresh = makeRefreshTokenRepository(
    options.rotation ?? { status: 'OK', userId: AUTH_USER.id, familyId: 'family-1' }
  );
  const tokens = makeTokenIssuer();
  const useCase = new RefreshSessionUseCase(
    router.routerDb,
    users.userRepo,
    refresh.refreshRepo,
    tokens.tokenIssuer,
    REFRESH_TTL_MS
  );

  return { useCase, router, users, refresh, tokens };
}

describe('RefreshSessionUseCase', () => {
  it('rotates the token, prunes the old hash and issues a new access token', async () => {
    const { useCase, refresh, tokens } = setup();
    const oldToken = generateRefreshToken(TENANT_ID);
    const before = Date.now();

    const result = await useCase.execute({ refreshToken: oldToken });

    expect(result.accessToken).toBe('access-token-1');
    expect(result.accessExpiresAt).toEqual(
      new Date('2030-01-01T00:00:00.000Z')
    );
    expect(parseRefreshToken(result.refreshToken)).toEqual({
      tenantId: TENANT_ID,
    });
    expect(result.refreshToken).not.toBe(oldToken);
    expect(result.user).toEqual(AUTH_USER);

    expect(refresh.rotations).toHaveLength(1);
    const [{ input, tid }] = refresh.rotations;
    expect(tid).toBe(TENANT_ID);
    expect(input.oldTokenHash).toBe(hashOpaqueToken(oldToken));
    expect(input.newTokenHash).toBe(hashOpaqueToken(result.refreshToken));
    expect(input.newExpiresAt.getTime()).toBeGreaterThanOrEqual(
      before + REFRESH_TTL_MS - 1_000
    );

    expect(tokens.issued).toEqual([
      {
        userId: AUTH_USER.id,
        tenantKey: TENANT_KEY,
        authorHash: AUTHOR_HASH,
      },
    ]);
  });

  it('rejects a malformed token without touching the router or DB', async () => {
    const { useCase, router, refresh } = setup();

    await expect(
      useCase.execute({ refreshToken: 'not-a-token' })
    ).rejects.toMatchObject({ code: 'ERR_REFRESH_TOKEN_INVALID' });
    expect(router.calls).toEqual([]);
    expect(refresh.rotations).toEqual([]);
  });

  it('rejects a token whose tenant is not provisioned', async () => {
    const { useCase, refresh } = setup({ byId: null });

    await expect(
      useCase.execute({ refreshToken: generateRefreshToken(TENANT_ID) })
    ).rejects.toMatchObject({ code: 'ERR_REFRESH_TOKEN_INVALID' });
    expect(refresh.rotations).toEqual([]);
  });

  it.each<RotateRefreshTokenResult>([
    { status: 'INVALID' },
    { status: 'REUSED', familyId: 'family-1' },
  ])('rejects rotation result $status', async (rotation) => {
    const { useCase, tokens } = setup({ rotation });

    await expect(
      useCase.execute({ refreshToken: generateRefreshToken(TENANT_ID) })
    ).rejects.toMatchObject({ code: 'ERR_REFRESH_TOKEN_INVALID' });
    expect(tokens.issued).toEqual([]);
  });

  it('refuses to refresh a system agent', async () => {
    const { useCase, tokens } = setup({
      user: { ...AUTH_USER, systemRole: 'SYSTEM_AGENT' },
    });

    await expect(
      useCase.execute({ refreshToken: generateRefreshToken(TENANT_ID) })
    ).rejects.toMatchObject({ code: 'ERR_REFRESH_TOKEN_INVALID' });
    expect(tokens.issued).toEqual([]);
  });

  it('rejects when the user row disappeared', async () => {
    const { useCase, tokens } = setup({ user: null });

    await expect(
      useCase.execute({ refreshToken: generateRefreshToken(TENANT_ID) })
    ).rejects.toMatchObject({ code: 'ERR_REFRESH_TOKEN_INVALID' });
    expect(tokens.issued).toEqual([]);
  });
});
