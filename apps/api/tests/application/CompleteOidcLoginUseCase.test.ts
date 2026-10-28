import { describe, expect, it } from 'vitest';
import { CompleteOidcLoginUseCase } from '../../src/application/use_cases/CompleteOidcLoginUseCase.js';
import { RedeemGlobalInvitationUseCase } from '../../src/application/use_cases/RedeemGlobalInvitationUseCase.js';
import {
  hashOpaqueToken,
  parseRefreshToken,
} from '../../src/shared/auth/refreshToken.js';
import type { OidcStateData } from '../../src/domain/ports/IOidcStateStore.js';
import type { GlobalInvitationRecord } from '../../src/domain/ports/IGlobalInvitationRepository.js';
import { makeUnitOfWork } from '../support/fakes.js';
import {
  AUTH_USER,
  OIDC_IDENTITY,
  OIDC_STATE,
  TENANT,
  TENANT_ID,
  WORKSPACE_ID,
  makeGlobalInvitationRepository,
  makeGlobalUserRepository,
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
    /** Result of `findTenantById` (the router by-uuid lookup). */
    byId?: typeof TENANT | null;
    state?: OidcStateData;
    /** Global invitations seeded in the router registry. */
    globalInvitations?: GlobalInvitationRecord[];
    /** When false, the redeem use case is NOT wired (legacy behavior). */
    withRedeem?: boolean;
  } = {}
) {
  const stateData = overrides.state === undefined ? OIDC_STATE : overrides.state;
  const states = makeStateStore({ 'state-1': stateData });
  const identity = makeIdentityProvider(
    overrides.identity === undefined ? OIDC_IDENTITY : overrides.identity
  );
  const router = makeRouterDb({
    tenant: overrides.tenant === undefined ? TENANT : overrides.tenant,
    byId: overrides.byId === undefined ? TENANT : overrides.byId,
  });
  const globalIdentity = makeGlobalUserRepository();
  const users = makeUserRepository();
  const refresh = makeRefreshTokenRepository();
  const invitation = makeInvitationRepository();
  const membership = makeMembershipRepository();
  const globalInvites = makeGlobalInvitationRepository(overrides.globalInvitations ?? []);
  const { uow } = makeUnitOfWork();
  const redeem = new RedeemGlobalInvitationUseCase(
    globalInvites.repo,
    globalIdentity.repo,
    router.routerDb,
    users.userRepo,
    membership.membershipRepo,
    uow
  );
  const useCase = new CompleteOidcLoginUseCase(
    states.stateStore,
    identity.identityProvider,
    router.routerDb,
    globalIdentity.repo,
    users.userRepo,
    invitation.repo,
    membership.membershipRepo,
    uow,
    refresh.refreshRepo,
    REFRESH_TTL_MS,
    overrides.withRedeem === false ? undefined : redeem
  );

  return {
    useCase,
    states,
    identity,
    router,
    users,
    refresh,
    membership,
    globalInvites,
    redeem,
  };
}

describe('CompleteOidcLoginUseCase', () => {
  it('redeems state, upserts the user and starts a refresh family', async () => {
    const { useCase, identity, router, users, refresh } = setup();
    const before = Date.now();

    const result = await useCase.execute({ code: 'auth-code', state: 'state-1' });

    expect(identity.exchangeCalls).toEqual([
      { code: 'auth-code', codeVerifier: 'verifier-1', nonce: 'nonce-1' },
    ]);
    expect(router.calls).toContain('findTenantsByGlobalUser:global-id-1');
    // P0-2: every institutional login refreshes the router global↔tenant link.
    expect(router.calls).toContain(
      `linkGlobalTenant:global-id-1:${TENANT_ID}:${AUTH_USER.id}:ACTIVE`
    );

    expect(users.oidcUpserts).toHaveLength(1);
    const [{ input, tid }] = users.oidcUpserts;
    expect(tid).toBe(TENANT_ID);
    expect(input).toMatchObject({
      issuer: 'https://idp.test',
      subject: 'idp-sub-1',
      email: 'ada@example.edu',
      fullName: 'Ada Lovelace',
    });
    expect((input as { authorHash?: string }).authorHash).toMatch(/^[a-f0-9]{64}$/);

    expect(refresh.creates).toHaveLength(1);
    const [{ input: created, tid: createdTid }] = refresh.creates;
    expect(createdTid).toBe(TENANT_ID);
    expect(created.userId).toBe(AUTH_USER.id);
    expect(created.familyId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(created.tokenHash).toBe(hashOpaqueToken(result.refreshToken as string));
    expect(created.tokenHash).not.toBe(result.refreshToken);
    expect(created.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + REFRESH_TTL_MS - 1_000
    );
    expect(created.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + REFRESH_TTL_MS + 1_000
    );

    expect(parseRefreshToken(result.refreshToken as string)).toEqual({
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

  describe('global invitation redemption (P0-2)', () => {
    const GLOBAL_TOKEN = 'c'.repeat(64);

    function globalInvitation(
      overrides: Partial<GlobalInvitationRecord> = {}
    ): GlobalInvitationRecord {
      return {
        id: 'global-inv-1',
        tokenHash: hashOpaqueToken(GLOBAL_TOKEN),
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        role: 'CONTRIBUTOR',
        email: 'ada@example.edu',
        status: 'PENDING',
        maxUses: null,
        usedCount: 0,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        ...overrides,
      };
    }

    it('redeems a global token for an invitee with no tenant link', async () => {
      // `tenant: null` → no claim match and no linked tenants: the ONLY way
      // this login can succeed is through the invitation itself.
      const { useCase, router, users, refresh, membership, globalInvites } = setup({
        tenant: null,
        byId: TENANT,
        state: { ...OIDC_STATE, invitationToken: GLOBAL_TOKEN },
        globalInvitations: [globalInvitation()],
      });

      const result = await useCase.execute({ code: 'auth-code', state: 'state-1' });

      expect(result.requiresTenantSelection).toBe(false);
      expect(result.user).toEqual(AUTH_USER);
      expect(parseRefreshToken(result.refreshToken as string)).toEqual({
        tenantId: TENANT_ID,
      });
      expect(refresh.creates).toHaveLength(1);
      expect(membership.added).toHaveLength(1);
      expect(membership.added[0]).toMatchObject({
        workspaceId: WORKSPACE_ID,
        role: 'CONTRIBUTOR',
      });
      expect(router.calls).toContain(
        `linkGlobalTenant:global-id-1:${TENANT_ID}:${AUTH_USER.id}:ACTIVE`
      );
      expect(globalInvites.records[0].status).toBe('ACCEPTED');
      // The tenant-local invitation path must NOT have been consulted.
      expect(
        router.calls.some((c) => c.startsWith('findTenantByOidcId'))
      ).toBe(false);
      expect(users.oidcUpserts).toHaveLength(1);
    });

    it('fails the login when the global invitation is expired', async () => {
      const { useCase, refresh, membership } = setup({
        tenant: null,
        state: { ...OIDC_STATE, invitationToken: GLOBAL_TOKEN },
        globalInvitations: [
          globalInvitation({ expiresAt: new Date(Date.now() - 1_000) }),
        ],
      });

      await expect(
        useCase.execute({ code: 'auth-code', state: 'state-1' })
      ).rejects.toMatchObject({ code: 'ERR_INVITATION_INVALID' });
      expect(refresh.creates).toEqual([]);
      expect(membership.added).toEqual([]);
    });

    it('fails the login when the identity email does not match the invitation', async () => {
      const { useCase, refresh } = setup({
        tenant: null,
        state: { ...OIDC_STATE, invitationToken: GLOBAL_TOKEN },
        globalInvitations: [globalInvitation({ email: 'someone-else@example.com' })],
      });

      await expect(
        useCase.execute({ code: 'auth-code', state: 'state-1' })
      ).rejects.toMatchObject({ code: 'ERR_INVITATION_INVALID' });
      expect(refresh.creates).toEqual([]);
    });

    it('falls through to the local invitation path when the token is not global', async () => {
      // Tenant-local token: isGlobalToken=false → normal resolution proceeds.
      // The tenant-local repo has no such invitation, so D9 strictness fails
      // the login AFTER the tenant user was created and linked.
      const { useCase, router, users, refresh } = setup({
        state: { ...OIDC_STATE, invitationToken: GLOBAL_TOKEN },
        globalInvitations: [],
      });

      await expect(
        useCase.execute({ code: 'auth-code', state: 'state-1' })
      ).rejects.toMatchObject({ code: 'ERR_INVITATION_INVALID' });
      expect(users.oidcUpserts).toHaveLength(1);
      expect(router.calls).toContain(
        `linkGlobalTenant:global-id-1:${TENANT_ID}:${AUTH_USER.id}:ACTIVE`
      );
      expect(refresh.creates).toEqual([]);
    });
  });
});
