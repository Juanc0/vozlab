/**
 * B12 (v5/TASK-08): `ManageRoleAtomicUseCase` is the single implementation
 * behind the admin's role endpoints — `AssignMemberRole` and
 * `RemoveMemberRole` were folded into it. These tests cover both the old
 * two behaviors and the guards the controller can no longer drift from.
 */
import { describe, expect, it } from 'vitest';
import { ManageRoleAtomicUseCase } from '../../src/application/use_cases/ManageRoleAtomicUseCase.js';
import { AUTH_USER, TENANT_ID, USER_ID } from '../support/authFakes.js';
import { makeUnitOfWork } from '../support/fakes.js';
import {
  ADMIN_USER_ID,
  MEMBER_USER_ID,
  NEW_USER_ID,
  OTHER_ADMIN_ID,
  makeMembershipAdminRepository,
  membershipRecord,
  workspaceRecord,
} from '../support/adminFakes.js';

function setup(
  options: {
    members?: ReturnType<typeof membershipRecord>[];
    /** Role the actor holds in the workspace (authorization answer). */
    actorRole?: 'ADMIN' | 'MODERATOR' | 'MEMBER' | null;
    /** User ids the tenant knows; anything else answers null. */
    knownUserIds?: string[];
  } = {}
) {
  const members = options.members ?? [
    membershipRecord({ userId: USER_ID, role: 'ADMIN', status: 'ACTIVE' }),
    membershipRecord({ userId: OTHER_ADMIN_ID, role: 'ADMIN', status: 'ACTIVE' }),
    membershipRecord({ userId: MEMBER_USER_ID, role: 'MEMBER', status: 'ACTIVE' }),
  ];
  const known = new Set(
    options.knownUserIds ?? [USER_ID, ADMIN_USER_ID, OTHER_ADMIN_ID, MEMBER_USER_ID, NEW_USER_ID]
  );

  const workspace = workspaceRecord();
  const workspaces = new Map([[workspace.id, workspace]]);
  const workspaceRepo = {
    async lockById(id: string) {
      return workspaces.get(id) ?? null;
    },
    async findById(id: string) {
      return workspaces.get(id) ?? null;
    },
  } as never;
  const membershipAdmin = makeMembershipAdminRepository(members);
  const actorRole = options.actorRole === undefined ? ('ADMIN' as const) : options.actorRole;
  const membershipRepo = {
    async getRole() {
      return actorRole;
    },
  } as never;
  const userRepo = {
    async findById(userId: string) {
      if (!known.has(userId)) return null;
      return { ...AUTH_USER, id: userId, systemRole: 'USER' };
    },
  };
  const { uow } = makeUnitOfWork();

  const useCase = new ManageRoleAtomicUseCase(
    membershipAdmin.repo,
    membershipRepo,
    workspaceRepo,
    userRepo as never,
    uow
  );

  const input = { actorUserId: USER_ID, tid: TENANT_ID, workspaceId: workspace.id };

  return { useCase, membershipAdmin, workspace, input, userRepo, membershipRepo };
}

describe('ManageRoleAtomicUseCase — add (was AssignMemberRole)', () => {
  it('grants the role and records the audit event in one flow', async () => {
    const { useCase, membershipAdmin, input } = setup();

    await useCase.execute({
      ...input,
      targetUserId: NEW_USER_ID,
      role: 'MEMBER',
      add: true,
      reqId: 'req-add',
    });

    const granted = membershipAdmin.members.get(`${input.workspaceId}:${NEW_USER_ID}`);
    expect(granted).toMatchObject({ role: 'MEMBER', status: 'ACTIVE' });
    expect(membershipAdmin.events).toHaveLength(1);
    expect(membershipAdmin.events[0]).toMatchObject({
      workspaceId: input.workspaceId,
      userId: NEW_USER_ID,
      actorType: 'ADMIN',
      actorId: USER_ID,
      action: 'ROLE_CHANGED',
      beforeRole: null,
      afterRole: 'MEMBER',
      requestId: 'req-add',
    });
  });

  it('refuses a target that never signed in to this tenant', async () => {
    const { useCase, membershipAdmin, input } = setup({ knownUserIds: [USER_ID] });

    await expect(
      useCase.execute({ ...input, targetUserId: 'ghost', role: 'MEMBER', add: true })
    ).rejects.toMatchObject({ code: 'ERR_USER_NOT_FOUND' });
    expect(membershipAdmin.events).toEqual([]);
  });

  it('refuses an actor without the workspace ADMIN role', async () => {
    const { useCase, membershipAdmin, input } = setup({ actorRole: 'MEMBER' });

    await expect(
      useCase.execute({ ...input, targetUserId: NEW_USER_ID, role: 'MEMBER', add: true })
    ).rejects.toMatchObject({ code: 'ERR_AUTHORIZATION_FAILED' });
    expect(membershipAdmin.events).toEqual([]);
  });
});

describe('ManageRoleAtomicUseCase — remove (was RemoveMemberRole)', () => {
  it('removes exactly the named role and records the audit event', async () => {
    const { useCase, membershipAdmin, input } = setup();

    await useCase.execute({
      ...input,
      targetUserId: MEMBER_USER_ID,
      role: 'MEMBER',
      add: false,
      reqId: 'req-remove',
    });

    expect(membershipAdmin.members.get(`${input.workspaceId}:${MEMBER_USER_ID}`)).toBeUndefined();
    expect(membershipAdmin.events).toHaveLength(1);
    expect(membershipAdmin.events[0]).toMatchObject({
      userId: MEMBER_USER_ID,
      action: 'ROLE_CHANGED',
      beforeRole: 'MEMBER',
      afterRole: null,
      requestId: 'req-remove',
    });
  });

  it('refuses to remove the last active ADMIN', async () => {
    const { useCase, membershipAdmin, input } = setup({
      members: [
        membershipRecord({ userId: USER_ID, role: 'ADMIN', status: 'ACTIVE' }),
        membershipRecord({ userId: OTHER_ADMIN_ID, role: 'ADMIN', status: 'SUSPENDED' }),
      ],
    });

    await expect(
      useCase.execute({ ...input, targetUserId: USER_ID, role: 'ADMIN', add: false })
    ).rejects.toMatchObject({ code: 'ERR_LAST_WORKSPACE_ADMIN' });
    expect(membershipAdmin.members.get(`${input.workspaceId}:${USER_ID}`)).toBeDefined();
    expect(membershipAdmin.events).toEqual([]);
  });

  it('removes an ADMIN while another active one remains', async () => {
    const { useCase, membershipAdmin, input } = setup();

    await useCase.execute({ ...input, targetUserId: OTHER_ADMIN_ID, role: 'ADMIN', add: false });

    expect(membershipAdmin.members.get(`${input.workspaceId}:${OTHER_ADMIN_ID}`)).toBeUndefined();
    expect(membershipAdmin.events[0]).toMatchObject({
      userId: OTHER_ADMIN_ID,
      beforeRole: 'ADMIN',
      afterRole: null,
    });
  });
});
