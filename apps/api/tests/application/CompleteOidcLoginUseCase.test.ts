import { describe, expect, it } from 'vitest';
import { CompleteOidcLoginUseCase } from '../../src/application/use_cases/CompleteOidcLoginUseCase.js';
import { RedeemInvitationAtomicUseCase } from '../../src/application/use_cases/RedeemInvitationAtomicUseCase.js';
import { deriveHandle } from '../../src/shared/auth/deriveHandle.js';
import { RedeemGlobalInvitationUseCase } from '../../src/application/use_cases/RedeemGlobalInvitationUseCase.js';
import {
  hashEmail,
  hashOpaqueToken,
  parseRefreshToken,
} from '../../src/shared/auth/refreshToken.js';
import type { OidcStateData } from '../../src/domain/ports/IOidcStateStore.js';
import type { AuditEvent, IAuditLog } from '../../src/domain/ports/IAuditLog.js';
import type { Invitation } from '../../src/domain/ports/IInvitationRepository.js';
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
    /** Global invitations seeded in the router registry. */
    globalInvitations?: GlobalInvitationRecord[];
    /** When false, the redeem use case is NOT wired (legacy behavior). */
    withRedeem?: boolean;
    /** B12: audit sink; when set, the login records `OIDC_LOGIN`. */
    audit?: IAuditLog;
    /** Seed for the tenant-local invitation fake (the D9 lookup + race). */
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
  const globalInvites = makeGlobalInvitationRepository(overrides.globalInvitations ?? []);
  const { uow } = makeUnitOfWork();
  const redeem = new RedeemGlobalInvitationUseCase(
    globalInvites.repo,
    globalUser.repo,
    router.routerDb,
    users.userRepo,
    membership.membershipRepo,
    uow
  );
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
    overrides.withRedeem === false ? undefined : redeem,
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
        `linkGlobalUserTenant:global-id-1:${TENANT_ID}:${AUTH_USER.id}:ACTIVE`
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
        `linkGlobalUserTenant:global-id-1:${TENANT_ID}:${AUTH_USER.id}:ACTIVE`
      );
      expect(refresh.creates).toEqual([]);
    });
  });

  describe('tenant-local invitation redemption (D9, composed by the B12 atom)', () => {
    /** The tenant-local invitation the login of this file would redeem. */
    function localInvitation(overrides: Partial<Invitation> = {}): Invitation {
      return {
        id: 'inv-local-1',
        workspaceId: WORKSPACE_ID,
        emailHash: hashEmail(OIDC_IDENTITY.email as string, PEPPER),
        role: 'MEMBER',
        tokenHash: 'token-hash',
        expiresAt: new Date(Date.now() + 60_000),
        maxUses: null,
        usedCount: 0,
        status: 'PENDING',
        revokedAt: null,
        createdBy: null,
        createdAt: new Date(),
        ...overrides,
      };
    }

    it('accepts the invitation and adds the membership atomically, then audits', async () => {
      const auditSink = makeAuditLog();
      const { useCase, invitation, membership } = setup({
        state: { ...OIDC_STATE, invitationToken: 'local-token-1' },
        invitationSeed: { byTokenHash: localInvitation() },
        audit: auditSink.audit,
      });

      const result = await useCase.execute({ code: 'auth-code', state: 'state-1' });

      expect(result.requiresTenantSelection).toBe(false);
      expect(invitation.calls).toContain('accept:inv-local-1');
      expect(membership.added).toHaveLength(1);
      expect(membership.added[0]).toMatchObject({
        userId: AUTH_USER.id,
        workspaceId: WORKSPACE_ID,
        role: 'MEMBER',
        tid: TENANT_ID,
      });
      // The atom's event carries the tenant the store routes by, and the
      // login's `OIDC_LOGIN` still lands — two distinct actions.
      const actions = auditSink.events.map((event) => event.action);
      expect(actions).toContain('INVITATION_REDEEMED');
      expect(actions).toContain('OIDC_LOGIN');
      const redeemed = auditSink.events.find(
        (event) => event.action === 'INVITATION_REDEEMED'
      );
      expect(redeemed).toMatchObject({
        tenantId: TENANT_ID,
        targetType: 'workspace',
        targetId: WORKSPACE_ID,
        actorId: AUTH_USER.id,
      });
      expect(redeemed?.metadata).toMatchObject({ invitationId: 'inv-local-1' });
    });

    it('fails the login when a concurrent redemption won the accept race', async () => {
      const { useCase, invitation, membership, refresh } = setup({
        state: { ...OIDC_STATE, invitationToken: 'local-token-1' },
        invitationSeed: { byTokenHash: localInvitation(), acceptResult: false },
      });

      await expect(
        useCase.execute({ code: 'auth-code', state: 'state-1' })
      ).rejects.toMatchObject({ code: 'ERR_INVITATION_INVALID' });
      expect(invitation.calls).toContain('accept:inv-local-1');
      expect(membership.added).toEqual([]);
      expect(refresh.creates).toEqual([]);
    });

    it('redeems when the IdP email differs from the bound hash only in case/whitespace (DEC-4 normalization)', async () => {
      // The invitation bound the peppered hash of `ada@example.edu`; the
      // IdP asserts the same address with different case and padding. The
      // hash equality must bridge the difference.
      const { useCase, membership } = setup({
        identity: { ...OIDC_IDENTITY, email: '  ADA@Example.EDU ' },
        state: { ...OIDC_STATE, invitationToken: 'local-token-1' },
        invitationSeed: { byTokenHash: localInvitation() },
      });

      const result = await useCase.execute({ code: 'auth-code', state: 'state-1' });

      expect(result.requiresTenantSelection).toBe(false);
      expect(membership.added).toHaveLength(1);
    });

    it('fails the login when the identity email hashes differently than the bound invitation', async () => {
      const { useCase, membership, refresh } = setup({
        identity: { ...OIDC_IDENTITY, email: 'mallory@example.edu' },
        state: { ...OIDC_STATE, invitationToken: 'local-token-1' },
        invitationSeed: { byTokenHash: localInvitation() },
      });

      await expect(
        useCase.execute({ code: 'auth-code', state: 'state-1' })
      ).rejects.toMatchObject({ code: 'ERR_INVITATION_INVALID' });
      expect(membership.added).toEqual([]);
      expect(refresh.creates).toEqual([]);
    });

    it('refuses an invitation already past its max uses', async () => {
      const { useCase, invitation, membership } = setup({
        state: { ...OIDC_STATE, invitationToken: 'local-token-1' },
        invitationSeed: {
          byTokenHash: localInvitation({ maxUses: 2, usedCount: 2 }),
        },
      });

      await expect(
        useCase.execute({ code: 'auth-code', state: 'state-1' })
      ).rejects.toMatchObject({ code: 'ERR_INVITATION_INVALID' });
      expect(invitation.calls).not.toContain('accept:inv-local-1');
      expect(membership.added).toEqual([]);
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
