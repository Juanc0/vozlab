import { describe, expect, it } from 'vitest';
import { RedeemGlobalInvitationUseCase } from '../../src/application/use_cases/RedeemGlobalInvitationUseCase.js';
import { hashOpaqueToken } from '../../src/shared/auth/refreshToken.js';
import type { GlobalInvitationRecord } from '../../src/domain/ports/IGlobalInvitationRepository.js';
import { makeUnitOfWork } from '../support/fakes.js';
import {
  AUTH_USER,
  TENANT,
  TENANT_ID,
  WORKSPACE_ID,
  makeGlobalInvitationRepository,
  makeGlobalUserRepository,
  makeMembershipRepository,
  makeRouterDb,
  makeUserRepository,
} from '../support/authFakes.js';

const TOKEN = 'f'.repeat(64);

function invitation(overrides: Partial<GlobalInvitationRecord> = {}): GlobalInvitationRecord {
  return {
    id: 'global-inv-1',
    tokenHash: hashOpaqueToken(TOKEN),
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

function setup(seed: GlobalInvitationRecord[] = [invitation()]) {
  const globalInvitations = makeGlobalInvitationRepository(seed);
  const globalUsers = makeGlobalUserRepository();
  const router = makeRouterDb();
  const users = makeUserRepository();
  const membership = makeMembershipRepository();
  const { uow, ran } = makeUnitOfWork();
  const useCase = new RedeemGlobalInvitationUseCase(
    globalInvitations.repo,
    globalUsers.repo,
    router.routerDb,
    users.userRepo,
    membership.membershipRepo,
    uow
  );
  return { useCase, globalInvitations, router, users, membership, ran };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    token: TOKEN,
    globalUserId: 'global-id-1',
    identityEmail: 'ada@example.edu',
    identityEmailVerified: true,
    issuer: 'https://other-idp.test',
    subject: 'other-sub-1',
    fullName: 'Ada L.',
    ...overrides,
  };
}

describe('RedeemGlobalInvitationUseCase', () => {
  it('isGlobalToken is true only for tokens present in the global registry', async () => {
    const { useCase } = setup();
    await expect(useCase.isGlobalToken(TOKEN)).resolves.toBe(true);
    await expect(useCase.isGlobalToken('a'.repeat(64))).resolves.toBe(false);
  });

  it('redeems: creates the tenant user, links the global identity, accepts and adds the membership', async () => {
    const { useCase, globalInvitations, router, users, membership, ran } = setup();

    const result = await useCase.execute(input());

    expect(result).toMatchObject({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      role: 'CONTRIBUTOR',
      userId: AUTH_USER.id,
    });
    expect(result.user).toEqual(AUTH_USER);

    // Tenant user created with the external identity of the OTHER IdP.
    expect(users.oidcUpserts).toHaveLength(1);
    expect(users.oidcUpserts[0].input).toMatchObject({
      issuer: 'https://other-idp.test',
      subject: 'other-sub-1',
      globalIdentityId: 'global-id-1',
    });
    expect(users.oidcUpserts[0].tid).toBe(TENANT_ID);

    // Router link written so the tenant shows up in future logins (P0-2).
    expect(router.calls).toContain(
      `linkGlobalTenant:global-id-1:${TENANT_ID}:${AUTH_USER.id}:ACTIVE`
    );

    // Single-use accept + membership inside one transaction.
    expect(globalInvitations.accepts).toEqual(['global-inv-1']);
    expect(globalInvitations.records[0].status).toBe('ACCEPTED');
    expect(ran.count).toBe(1);
    expect(membership.added).toEqual([
      {
        userId: AUTH_USER.id,
        workspaceId: WORKSPACE_ID,
        role: 'CONTRIBUTOR',
        tid: TENANT_ID,
        tx: expect.anything(),
      },
    ]);
  });

  it('records a GLOBAL_INVITATION_REDEEMED event in the router audit', async () => {
    const globalInvitations = makeGlobalInvitationRepository();
    const router = makeRouterDb();
    const events: Array<Record<string, unknown>> = [];
    const useCase = new RedeemGlobalInvitationUseCase(
      globalInvitations.repo,
      makeGlobalUserRepository().repo,
      router.routerDb,
      makeUserRepository().userRepo,
      makeMembershipRepository().membershipRepo,
      makeUnitOfWork().uow,
      { async record(e) { events.push(e as unknown as Record<string, unknown>); } }
    );
    const created = await globalInvitations.repo.createInvitation({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      role: 'MEMBER',
      email: 'ada@example.edu',
      tokenHash: hashOpaqueToken(TOKEN),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await useCase.execute(input());

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'GLOBAL_INVITATION_REDEEMED',
      targetType: 'global_identity',
      globalIdentityId: 'global-id-1',
      tenantId: TENANT_ID,
      actorType: 'USER',
      metadata: { invitationId: created.id, workspaceId: WORKSPACE_ID },
    });
  });

  it('rejects an unknown token', async () => {
    const { useCase } = setup([]);
    await expect(useCase.execute(input())).rejects.toMatchObject({
      code: 'ERR_INVITATION_INVALID',
    });
  });

  it('rejects an expired invitation', async () => {
    const { useCase } = setup([
      invitation({ expiresAt: new Date(Date.now() - 1_000) }),
    ]);
    await expect(useCase.execute(input())).rejects.toMatchObject({
      code: 'ERR_INVITATION_INVALID',
    });
  });

  it('rejects when the identity email does not match the bound email', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute(input({ identityEmail: 'mallory@example.com' }))
    ).rejects.toMatchObject({ code: 'ERR_INVITATION_INVALID' });
  });

  it('rejects an unverified identity email even when it matches', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute(input({ identityEmailVerified: false }))
    ).rejects.toMatchObject({ code: 'ERR_INVITATION_INVALID' });
  });

  it('rejects when the concurrent accept loses the race', async () => {
    const seed = [invitation()];
    const { useCase, globalInvitations } = setup(seed);
    // Force accept to fail after the pre-check passed.
    globalInvitations.repo.accept = async () => false;
    await expect(useCase.execute(input())).rejects.toMatchObject({
      code: 'ERR_INVITATION_INVALID',
    });
  });

  it('rejects when the invitation tenant is not provisioned', async () => {
    const router = makeRouterDb({ byId: null });
    const globalInvitations = makeGlobalInvitationRepository([
      invitation({ tenantId: '99999999-9999-4999-8999-999999999999' }),
    ]);
    const useCase = new RedeemGlobalInvitationUseCase(
      globalInvitations.repo,
      makeGlobalUserRepository().repo,
      router.routerDb,
      makeUserRepository().userRepo,
      makeMembershipRepository().membershipRepo,
      makeUnitOfWork().uow
    );
    await expect(useCase.execute(input())).rejects.toMatchObject({
      code: 'ERR_TENANT_NOT_PROVISIONED',
    });
  });
});
