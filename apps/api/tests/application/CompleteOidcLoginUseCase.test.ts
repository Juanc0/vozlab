import { describe, expect, it } from 'vitest';
import { CompleteOidcLoginUseCase } from '../../src/application/use_cases/CompleteOidcLoginUseCase.js';
import {
  hashOpaqueToken,
  parseRefreshToken,
} from '../../src/shared/auth/refreshToken.js';
import {
  AUTH_USER,
  OIDC_IDENTITY,
  OIDC_STATE,
  TENANT,
  TENANT_ID,
  makeGlobalIdentityRepository,
  makeIdentityProvider,
  makeInvitationRepository,
  makeMembershipRepository,
  makeRefreshTokenRepository,
  makeRouterDb,
  makeStateStore,
  makeUserRepository,
} from '../support/authFakes.js';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function setup(
  overrides: {
    identity?: typeof OIDC_IDENTITY;
    tenant?: typeof TENANT | null;
  } = {}
) {
  const states = makeStateStore({ 'state-1': OIDC_STATE });
  const identity = makeIdentityProvider(
    overrides.identity === undefined ? OIDC_IDENTITY : overrides.identity
  );
  const router = makeRouterDb({
    tenant: overrides.tenant === undefined ? TENANT : overrides.tenant,
  });
  const globalIdentity = makeGlobalIdentityRepository();
  const users = makeUserRepository();
  const refresh = makeRefreshTokenRepository();
  const invitation = makeInvitationRepository();
  const membership = makeMembershipRepository();
  const useCase = new CompleteOidcLoginUseCase(
    states.stateStore,
    identity.identityProvider,
    router.routerDb,
    globalIdentity.repo,
    users.userRepo,
    invitation.repo,
    membership.membershipRepo,
    refresh.refreshRepo,
    REFRESH_TTL_MS
  );

  return { useCase, states, identity, router, users, refresh };
}

describe('CompleteOidcLoginUseCase', () => {
  it('redeems state, upserts the user and starts a refresh family', async () => {
    const { useCase, identity, router, users, refresh } = setup();
    const before = Date.now();

    const result = await useCase.execute({ code: 'auth-code', state: 'state-1' });

    expect(identity.exchangeCalls).toEqual([
      { code: 'auth-code', codeVerifier: 'verifier-1', nonce: 'nonce-1' },
    ]);
    expect(router.calls).toContain('findTenantBySlug:local');

    expect(users.oidcUpserts).toHaveLength(1);
    const [{ input, tid }] = users.oidcUpserts;
    expect(tid).toBe(TENANT_ID);
    expect(input).toMatchObject({
      issuer: 'https://idp.test',
      subject: 'idp-sub-1',
      email: 'ada@example.edu',
      fullName: 'Ada Lovelace',
    });
    expect(input.authorHash).toMatch(/^[a-f0-9]{64}$/);

    expect(refresh.creates).toHaveLength(1);
    const [{ input: created, tid: createdTid }] = refresh.creates;
    expect(createdTid).toBe(TENANT_ID);
    expect(created.userId).toBe(AUTH_USER.id);
    expect(created.familyId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(created.tokenHash).toBe(hashOpaqueToken(result.refreshToken));
    expect(created.tokenHash).not.toBe(result.refreshToken);
    expect(created.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + REFRESH_TTL_MS - 1_000
    );
    expect(created.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + REFRESH_TTL_MS + 1_000
    );

    expect(parseRefreshToken(result.refreshToken)).toEqual({
      tenantId: TENANT_ID,
    });
    expect(result.redirectPath).toBe('/proposals');
    expect(result.user).toEqual(AUTH_USER);
  });

  it('rejects an unknown or already-used state before contacting the IdP', async () => {
    const { useCase, identity } = setup();

    await expect(
      useCase.execute({ code: 'auth-code', state: 'missing' })
    ).rejects.toMatchObject({ code: 'ERR_INVALID_OIDC_STATE' });
    expect(identity.exchangeCalls).toEqual([]);

    await useCase.execute({ code: 'auth-code', state: 'state-1' });
    await expect(
      useCase.execute({ code: 'auth-code', state: 'state-1' })
    ).rejects.toMatchObject({ code: 'ERR_INVALID_OIDC_STATE' });
    expect(identity.exchangeCalls).toHaveLength(1);
  });

  it('rejects an unverified email without creating an account', async () => {
    const { useCase, users, refresh } = setup({
      identity: { ...OIDC_IDENTITY, emailVerified: false },
    });

    await expect(
      useCase.execute({ code: 'auth-code', state: 'state-1' })
    ).rejects.toMatchObject({ code: 'ERR_EMAIL_NOT_VERIFIED' });
    expect(users.oidcUpserts).toEqual([]);
    expect(refresh.creates).toEqual([]);
  });

  it('rejects a tenant claim that is not provisioned', async () => {
    const { useCase, users, refresh } = setup({ tenant: null });

    await expect(
      useCase.execute({ code: 'auth-code', state: 'state-1' })
    ).rejects.toMatchObject({ code: 'ERR_TENANT_NOT_PROVISIONED' });
    expect(users.oidcUpserts).toEqual([]);
    expect(refresh.creates).toEqual([]);
  });
});
