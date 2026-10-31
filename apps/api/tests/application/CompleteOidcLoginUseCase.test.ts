import { describe, expect, it } from 'vitest';
import { CompleteOidcLoginUseCase } from '../../src/application/use_cases/CompleteOidcLoginUseCase.js';
import { RedeemInvitationAtomicUseCase } from '../../src/application/use_cases/RedeemInvitationAtomicUseCase.js';
import { deriveHandle } from '../../src/shared/auth/deriveHandle.js';
import {
  hashEmail,
  hashOpaqueToken,
  parseRefreshToken,
} from '../../src/shared/auth/refreshToken.js';
import type { OidcStateData } from '../../src/domain/ports/IOidcStateStore.js';
import type { AuditEvent, IAuditLog } from '../../src/domain/ports/IAuditLog.js';
import type { Invitation } from '../../src/domain/ports/IInvitationRepository.js';
import { makeUnitOfWork } from '../support/fakes.js';
import {
  AUTH_USER,
  OIDC_IDENTITY,
  OIDC_STATE,
  TENANT,
  TENANT_ID,
  WORKSPACE_ID,
  makeCredentialRouteRepository,
  makeGlobalUserRepository,
  makeAuditLog,
  makeIdentityProvider,
  makeInvitationRepository,
  makeMembershipRepository,
  makeRefreshTokenRepository,
  makeRouterDb,
  makeStateStore,
  makeUserRepository,
} from '../support/authFakes.js';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PEPPER = 'unit-test-pepper-at-least-32-characters!!';

function setup(
  overrides: {
    identity?: typeof OIDC_IDENTITY;
    tenant?: typeof TENANT | null;
    /** Result of `findTenantById` (the router by-uuid lookup). */
    byId?: typeof TENANT | null;
    state?: OidcStateData;
    /** Seed for the credential-route directory fake (`"<hash>:<kind>"` → tenant). */
    routes?: Record<string, string>;
    /** B12: audit sink; when set, the login records `OIDC_LOGIN`. */
    audit?: IAuditLog;
    /** Seed for the tenant invitation fake (the DEC-9 lookup + race). */
    invitationSeed?: { byTokenHash?: Invitation | null; acceptResult?: boolean };
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
  const globalUser = makeGlobalUserRepository();
  const users = makeUserRepository();
  const refresh = makeRefreshTokenRepository();
  const invitation = makeInvitationRepository(overrides.invitationSeed);
  const membership = makeMembershipRepository();
  const routes = makeCredentialRouteRepository(overrides.routes ?? {});
  const { uow } = makeUnitOfWork();
  // B12: the login composes the atomic redemption — same repos, same uow,
  // so the `accept`/`add` assertions on the fakes keep proving the flow.
  const redeemInvitation = new RedeemInvitationAtomicUseCase(
    invitation.repo,
    membership.membershipRepo,
    uow,
    overrides.audit
  );
  const useCase = new CompleteOidcLoginUseCase(
    states.stateStore,
    identity.identityProvider,
    router.routerDb,
    globalUser.repo,
    users.userRepo,
    invitation.repo,
    refresh.refreshRepo,
    REFRESH_TTL_MS,
    redeemInvitation,
    PEPPER,
    routes.credentialRoutes,
    overrides.audit
  );

  return {
    useCase,
    states,
    identity,
    router,
    globalUser,
    users,
    refresh,
    invitation,
    membership,
    routes,
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
      `linkGlobalUserTenant:global-id-1:${TENANT_ID}:${AUTH_USER.id}:ACTIVE`
    );

    expect(users.oidcUpserts).toHaveLength(1);
    const [{ input, tid }] = users.oidcUpserts;
    expect(tid).toBe(TENANT_ID);
    expect(input).toMatchObject({
      issuer: 'https://idp.test',
      subject: 'idp-sub-1',
      fullName: 'Ada Lovelace',
      // B14: with no `preferred_username` asserted, the email local-part
      // is the derived search alias.
      handle: 'ada',
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

  describe('vault profile (audit P7.4)', () => {
    it('passes the IdP picture claim through to the global-user upsert', async () => {
      const { useCase, globalUser } = setup({
        identity: {
          ...OIDC_IDENTITY,
          picture: 'https://idp.test/avatar/ada.png',
        },
      });

      await useCase.execute({ code: 'auth-code', state: 'state-1' });

      expect(globalUser.profiles).toHaveLength(1);
      expect(globalUser.profiles[0]).toMatchObject({
        picture: 'https://idp.test/avatar/ada.png',
      });
    });

    it('stores null when the provider asserts no picture', async () => {
      const { useCase, globalUser } = setup();

      await useCase.execute({ code: 'auth-code', state: 'state-1' });

      expect(globalUser.profiles[0]).toMatchObject({ picture: null });
    });

    it('truncates an oversized claim to the varchar(1024) vault column', async () => {
      const { useCase, globalUser } = setup({
        identity: { ...OIDC_IDENTITY, picture: 'x'.repeat(1500) },
      });

      await useCase.execute({ code: 'auth-code', state: 'state-1' });

      expect(globalUser.profiles[0]?.picture).toHaveLength(1024);
    });

    it('carries the peppered hash of the asserted email, never the cleartext (DEC-4)', async () => {
      const { useCase, globalUser } = setup();

      await useCase.execute({ code: 'auth-code', state: 'state-1' });

      expect(globalUser.profiles[0]?.emailHash).toBe(
        hashEmail(OIDC_IDENTITY.email as string, PEPPER)
      );
      expect(globalUser.profiles[0]).not.toHaveProperty('email');
    });
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

  describe('unified invitation redemption (DEC-9, audit §8.5)', () => {
    const TOKEN = 'unified-invitation-token-1';
    const TOKEN_HASH = hashOpaqueToken(TOKEN);

    /** The tenant invitation the unified path would redeem in these tests. */
    function pendingInvitation(overrides: Partial<Invitation> = {}): Invitation {
      return {
        id: 'inv-1',
        workspaceId: WORKSPACE_ID,
        emailHash: hashEmail(OIDC_IDENTITY.email as string, PEPPER),
        role: 'MEMBER',
        tokenHash: TOKEN_HASH,
        expiresAt: new Date(Date.now() + 60_000),
        maxUses: 1,
        usedCount: 0,
        status: 'PENDING',
        revokedAt: null,
        createdBy: null,
        createdAt: new Date(),
        ...overrides,
      };
    }

    /** Route the token to TENANT_ID in the directory fake. */
    function routed(): Record<string, string> {
      return { [`${TOKEN_HASH}:INVITATION`]: TENANT_ID };
    }

    it('redeems a routable invitation for an invitee with no tenant link (external persona)', async () => {
      // `tenant: null` → no claim match and no linked tenants: the ONLY way
      // this login can succeed is through the routed invitation — the token
      // IS the tenant selector for the hop (same path as an same-org link).
      const auditSink = makeAuditLog();
      const { useCase, router, users, refresh, membership, invitation } = setup({
        tenant: null,
        byId: TENANT,
        state: { ...OIDC_STATE, invitationToken: TOKEN },
        routes: routed(),
        invitationSeed: { byTokenHash: pendingInvitation() },
        audit: auditSink.audit,
      });

      const result = await useCase.execute({ code: 'auth-code', state: 'state-1' });

      expect(result.requiresTenantSelection).toBe(false);
      expect(result.user).toEqual(AUTH_USER);
      expect(parseRefreshToken(result.refreshToken as string)).toEqual({
        tenantId: TENANT_ID,
      });
      expect(refresh.creates).toHaveLength(1);
      expect(users.oidcUpserts).toHaveLength(1);
      expect(membership.added).toHaveLength(1);
      expect(membership.added[0]).toMatchObject({
        userId: AUTH_USER.id,
        workspaceId: WORKSPACE_ID,
        role: 'MEMBER',
        tid: TENANT_ID,
      });
      expect(invitation.calls).toContain('accept:inv-1');
      expect(router.calls).toContain(
        `linkGlobalUserTenant:global-id-1:${TENANT_ID}:${AUTH_USER.id}:ACTIVE`
      );
      // The institutional resolution never ran: the route answered the tenant.
      expect(
        router.calls.some((c) => c.startsWith('findTenantByOidcId'))
      ).toBe(false);
      // Ruling 6: the trail is the tenant-side accept + the OIDC_LOGIN vault
      // event — no new global action string.
      const actions = auditSink.events.map((event) => event.action);
      expect(actions).toContain('INVITATION_REDEEMED');
      expect(actions).toContain('OIDC_LOGIN');
    });

    it('redeems when the IdP email differs from the bound hash only in case/whitespace (DEC-4 normalization)', async () => {
      // The invitation bound the peppered hash of `ada@example.edu`; the
      // IdP asserts the same address with different case and padding. The
      // hash equality must bridge the difference.
      const { useCase, membership } = setup({
        identity: { ...OIDC_IDENTITY, email: '  ADA@Example.EDU ' },
        state: { ...OIDC_STATE, invitationToken: TOKEN },
        routes: routed(),
        invitationSeed: { byTokenHash: pendingInvitation() },
      });

      const result = await useCase.execute({ code: 'auth-code', state: 'state-1' });

      expect(result.requiresTenantSelection).toBe(false);
      expect(membership.added).toHaveLength(1);
    });

    it('continues the login without redemption when the token is not routable (stale link, ruling 7)', async () => {
      // No directory row for the hash: the link is simply invalid. The
      // ordinary institutional flow proceeds — login is never bricked.
      const { useCase, invitation, membership, refresh } = setup({
        state: { ...OIDC_STATE, invitationToken: TOKEN },
        routes: {},
        invitationSeed: { byTokenHash: pendingInvitation() },
      });

      const result = await useCase.execute({ code: 'auth-code', state: 'state-1' });

      expect(result.requiresTenantSelection).toBe(false);
      // The tenant invitation was never consulted: routing gates lookup.
      expect(invitation.calls).toEqual([]);
      expect(membership.added).toEqual([]);
      expect(refresh.creates).toHaveLength(1);
    });

    it('continues the login with no grant when the invitation was revoked (route stale, authority gone)', async () => {
      // DEC-9 invariant: the admin revoke touches the tenant row only; the
      // route stays inert. Redemption sees REVOKED → login proceeds, no
      // membership, no session-destroying error.
      const { useCase, invitation, membership, refresh } = setup({
        state: { ...OIDC_STATE, invitationToken: TOKEN },
        routes: routed(),
        invitationSeed: { byTokenHash: pendingInvitation({ status: 'REVOKED' }) },
      });

      const result = await useCase.execute({ code: 'auth-code', state: 'state-1' });

      expect(result.requiresTenantSelection).toBe(false);
      expect(invitation.calls).not.toContain('accept:inv-1');
      expect(membership.added).toEqual([]);
      expect(refresh.creates).toHaveLength(1);
    });

    it('continues the login with no grant when the invitation expired', async () => {
      const { useCase, invitation, membership, refresh } = setup({
        state: { ...OIDC_STATE, invitationToken: TOKEN },
        routes: routed(),
        invitationSeed: {
          byTokenHash: pendingInvitation({
            expiresAt: new Date(Date.now() - 1_000),
          }),
        },
      });

      const result = await useCase.execute({ code: 'auth-code', state: 'state-1' });

      expect(result.requiresTenantSelection).toBe(false);
      expect(invitation.calls).not.toContain('accept:inv-1');
      expect(membership.added).toEqual([]);
      expect(refresh.creates).toHaveLength(1);
    });

    it('continues the login with no grant when the invitation is past its max uses', async () => {
      const { useCase, invitation, membership, refresh } = setup({
        state: { ...OIDC_STATE, invitationToken: TOKEN },
        routes: routed(),
        invitationSeed: {
          byTokenHash: pendingInvitation({ maxUses: 1, usedCount: 1 }),
        },
      });

      const result = await useCase.execute({ code: 'auth-code', state: 'state-1' });

      expect(result.requiresTenantSelection).toBe(false);
      expect(invitation.calls).not.toContain('accept:inv-1');
      expect(membership.added).toEqual([]);
      expect(refresh.creates).toHaveLength(1);
    });

    it('continues the login with no grant when the identity email hashes differently', async () => {
      // Someone else followed the link: the bind rejects, the human still
      // logs in through their own tenant — the invitation grants nothing.
      const { useCase, invitation, membership, refresh } = setup({
        identity: { ...OIDC_IDENTITY, email: 'mallory@example.edu' },
        state: { ...OIDC_STATE, invitationToken: TOKEN },
        routes: routed(),
        invitationSeed: { byTokenHash: pendingInvitation() },
      });

      const result = await useCase.execute({ code: 'auth-code', state: 'state-1' });

      expect(result.requiresTenantSelection).toBe(false);
      expect(invitation.calls).not.toContain('accept:inv-1');
      expect(membership.added).toEqual([]);
      expect(refresh.creates).toHaveLength(1);
    });

    it('continues the login when a concurrent redemption won the accept race', async () => {
      const { useCase, invitation, membership, refresh, router } = setup({
        state: { ...OIDC_STATE, invitationToken: TOKEN },
        routes: routed(),
        invitationSeed: {
          byTokenHash: pendingInvitation(),
          acceptResult: false,
        },
      });

      const result = await useCase.execute({ code: 'auth-code', state: 'state-1' });

      expect(result.requiresTenantSelection).toBe(false);
      expect(invitation.calls).toContain('accept:inv-1');
      // The loser's grant never landed, but its session does.
      expect(membership.added).toEqual([]);
      expect(refresh.creates).toHaveLength(1);
      // MEDIUM-1 (task-6 review): the redemption path writes NO router link
      // when the accept fails — the tenant must not be parked in the picker
      // or auto-selected by a grant that never happened. The single link
      // write here is the ordinary institutional-path one (the claim-resolved
      // session), never a second one for the inert invitation.
      const linkWrites = router.calls.filter((c) =>
        c.startsWith('linkGlobalUserTenant')
      );
      expect(linkWrites).toHaveLength(1);
    });
  });

  describe('identity trail (B12)', () => {
    it('records OIDC_LOGIN on the global user for every issued session', async () => {
      const { audit, events } = makeAuditLog();
      const { useCase } = setup({ audit });

      await useCase.execute({ code: 'auth-code', state: 'state-1' });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        action: 'OIDC_LOGIN',
        actorId: AUTH_USER.id,
        actorType: 'USER',
        targetType: 'global_identity',
        targetId: 'global-id-1',
        tenantId: TENANT_ID,
        globalUserId: 'global-id-1',
      });
      expect(events[0]?.metadata).toMatchObject({ redirectPath: '/proposals' });
    });

    it('records nothing when no audit sink is wired', async () => {
      const { useCase } = setup();
      await expect(
        useCase.execute({ code: 'auth-code', state: 'state-1' })
      ).resolves.toMatchObject({ requiresTenantSelection: false });
    });
  });
});

describe('deriveHandle (v6/TASK-03, B14)', () => {
  it('prefers the IdP preferred_username over the email', () => {
    expect(
      deriveHandle({ preferredUsername: 'Ada-L', email: 'ada@example.edu', subject: 'sub-1' })
    ).toBe('ada-l');
  });

  it('falls back to the email local-part, normalized', () => {
    // uppercase lowered, dots/spaces become dashes, edges trimmed.
    expect(deriveHandle({ email: 'Test.User @x.co', subject: 'sub-1' })).toBe('test-user');
  });

  it('falls back to the prefixed subject when no username or email exists', () => {
    expect(deriveHandle({ email: null, subject: 'ABC-123' })).toBe('u-abc-123');
  });

  it('truncates to the varchar(64) column width', () => {
    const long = 'a'.repeat(100);
    expect(deriveHandle({ email: `${long}@example.edu`, subject: 's' })).toHaveLength(64);
    expect(deriveHandle({ preferredUsername: long, email: null, subject: 's' })).toHaveLength(64);
  });

  it('is deterministic: the same profile always yields the same alias', () => {
    const profile = { preferredUsername: 'Juán', email: 'j@example.edu', subject: 'sub-7' };
    expect(deriveHandle(profile)).toBe(deriveHandle(profile));
    // non-[a-z0-9_-] runs collapse to a single dash
    expect(deriveHandle(profile)).toBe('ju-n');
  });

  it('never returns an empty string for a degenerate profile', () => {
    // email local-part is only separators, subject is only punctuation:
    // the subject fallback normalizes to something non-empty and stable.
    const handle = deriveHandle({ email: '@@example.edu', subject: '...' });
    expect(handle).toBe('u');
    expect(handle.length).toBeGreaterThan(0);
    // A normal subject still yields the readable prefix form.
    expect(deriveHandle({ email: null, subject: 'x-9' })).toBe('u-x-9');
  });
});
