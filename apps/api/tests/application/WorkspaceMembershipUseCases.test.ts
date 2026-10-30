import { describe, expect, it } from 'vitest';
import { AddWorkspaceMemberUseCase } from '../../src/application/use_cases/AddWorkspaceMemberUseCase.js';
import { ChangeMemberRoleUseCase } from '../../src/application/use_cases/ChangeMemberRoleUseCase.js';
import { ReactivateMemberUseCase } from '../../src/application/use_cases/ReactivateMemberUseCase.js';
import { RemoveMemberUseCase } from '../../src/application/use_cases/RemoveMemberUseCase.js';
import { SuspendMemberUseCase } from '../../src/application/use_cases/SuspendMemberUseCase.js';
import { AUTH_USER, TENANT_ID, USER_ID } from '../support/authFakes.js';
import { makeUnitOfWork } from '../support/fakes.js';
import {
  ADMIN_USER_ID,
  MEMBER_USER_ID,
  NEW_USER_ID,
  OTHER_ADMIN_ID,
  makeMembershipAdminRepository,
  makeTenantAdminRepository,
  membershipRecord,
  tenantUser,
  workspaceRecord,
} from '../support/adminFakes.js';

function setup(
  members = [
    membershipRecord({ userId: USER_ID, role: 'ADMIN', status: 'ACTIVE' }),
    membershipRecord({ userId: OTHER_ADMIN_ID, role: 'ADMIN', status: 'ACTIVE' }),
    membershipRecord({ userId: MEMBER_USER_ID, role: 'MEMBER', status: 'ACTIVE' }),
  ]
) {
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
  const tenantAdmin = makeTenantAdminRepository([
    tenantUser({ id: MEMBER_USER_ID, handle: 'member-handle' }),
    tenantUser({ id: OTHER_ADMIN_ID, handle: 'other-handle' }),
    tenantUser({ id: NEW_USER_ID, handle: 'newcomer-handle' }),
  ]);
  const routerDb = {
    async findGlobalUserTenantLink(globalUserId: string, _tid: string) {
      if (globalUserId === 'global-new-user') {
        return { tenantUserId: NEW_USER_ID, status: 'ACTIVE' };
      }
      return null;
    },
  } as never;
  const userRepo = {
    async findById(userId: string) {
      return { ...AUTH_USER, id: userId, systemRole: 'USER' };
    },
    async findByHandle(handle: string, _tid: string) {
      const byHandle: Record<string, string> = {
        newcomer: NEW_USER_ID,
        other: OTHER_ADMIN_ID,
      };
      const id = byHandle[handle];
      if (!id) return null;
      return { ...AUTH_USER, id, systemRole: id === NEW_USER_ID ? 'USER' : 'ADMIN' };
    },
  };
  const { uow, ran } = makeUnitOfWork();
  // The narrow repository writes the same rows the admin reads see.
  const membershipRepo = {
    async getRole() {
      return 'ADMIN' as const;
    },
    async suspend(userId: string, workspaceId: string) {
      const member = membershipAdmin.members.get(`${workspaceId}:${userId}`);
      if (member) member.status = 'SUSPENDED';
    },
    async reactivate(userId: string, workspaceId: string) {
      const member = membershipAdmin.members.get(`${workspaceId}:${userId}`);
      if (member) member.status = 'ACTIVE';
    },
    async remove(userId: string, workspaceId: string) {
      const member = membershipAdmin.members.get(`${workspaceId}:${userId}`);
      if (member) member.status = 'REMOVED';
    },
  } as never;

  const input = { actorUserId: USER_ID, tid: TENANT_ID, workspaceId: workspace.id };

  return {
    ran,
    workspace,
    membershipRepo,
    membershipAdmin,
    tenantAdmin,
    changeRole: new ChangeMemberRoleUseCase(
      membershipAdmin.repo,
      membershipRepo,
      workspaceRepo,
      userRepo as never,
      uow
    ),
    suspend: new SuspendMemberUseCase(
      membershipAdmin.repo,
      membershipRepo,
      workspaceRepo,
      userRepo as never,
      uow
    ),
    reactivate: new ReactivateMemberUseCase(
      membershipAdmin.repo,
      membershipRepo,
      userRepo as never,
      uow
    ),
    remove: new RemoveMemberUseCase(
      membershipAdmin.repo,
      membershipRepo,
      workspaceRepo,
      userRepo as never,
      uow
    ),
    add: new AddWorkspaceMemberUseCase(
      membershipAdmin.repo,
      tenantAdmin.repo,
      membershipRepo,
      userRepo as never,
      routerDb,
      uow
    ),
    input,
  };
}

describe('ChangeMemberRoleUseCase', () => {
  it('refuses to demote the last active ADMIN', async () => {
    const ctx = setup([
      membershipRecord({ userId: USER_ID, role: 'ADMIN', status: 'ACTIVE' }),
      membershipRecord({ userId: MEMBER_USER_ID, role: 'MEMBER', status: 'ACTIVE' }),
    ]);

    await expect(
      ctx.changeRole.execute({
        ...ctx.input,
        targetUserId: USER_ID,
        role: 'MEMBER',
      })
    ).rejects.toMatchObject({ code: 'ERR_LAST_WORKSPACE_ADMIN' });
  });

  it('demotes an ADMIN when another active one remains', async () => {
    const ctx = setup();

    await ctx.changeRole.execute({
      ...ctx.input,
      targetUserId: OTHER_ADMIN_ID,
      role: 'MODERATOR',
    });

    expect(
      ctx.membershipAdmin.members.get(`${ctx.workspace.id}:${OTHER_ADMIN_ID}`)
        ?.role
    ).toBe('MODERATOR');
    expect(ctx.membershipAdmin.events[0]?.action).toBe('ROLE_CHANGED');
    expect(ctx.ran.count).toBe(1);
  });

  it('answers MEMBER_NOT_FOUND for a user with no membership', async () => {
    const ctx = setup();

    await expect(
      ctx.changeRole.execute({
        ...ctx.input,
        targetUserId: '99999999-9999-4999-8999-999999999999',
        role: 'MEMBER',
      })
    ).rejects.toMatchObject({ code: 'ERR_MEMBER_NOT_FOUND' });
  });
});

describe('SuspendMemberUseCase', () => {
  it('refuses self-suspension', async () => {
    const ctx = setup();

    await expect(
      ctx.suspend.execute({ ...ctx.input, targetUserId: USER_ID })
    ).rejects.toMatchObject({ code: 'ERR_CANNOT_MODIFY_SELF' });
  });

  it('refuses to suspend the last active ADMIN', async () => {
    const ctx = setup([
      membershipRecord({ userId: OTHER_ADMIN_ID, role: 'ADMIN', status: 'ACTIVE' }),
      membershipRecord({ userId: MEMBER_USER_ID, role: 'MEMBER', status: 'ACTIVE' }),
    ]);

    await expect(
      ctx.suspend.execute({ ...ctx.input, targetUserId: OTHER_ADMIN_ID })
    ).rejects.toMatchObject({ code: 'ERR_LAST_WORKSPACE_ADMIN' });
  });

  it('suspends a member and records the audit event', async () => {
    const ctx = setup();

    await ctx.suspend.execute({ ...ctx.input, targetUserId: MEMBER_USER_ID });

    expect(ctx.membershipAdmin.events[0]?.action).toBe('SUSPENDED');
  });
});

describe('ReactivateMemberUseCase / RemoveMemberUseCase', () => {
  it('refuses self-removal', async () => {
    const ctx = setup();

    await expect(
      ctx.remove.execute({ ...ctx.input, targetUserId: USER_ID })
    ).rejects.toMatchObject({ code: 'ERR_CANNOT_MODIFY_SELF' });
  });

  it('removes a member and keeps the audit row', async () => {
    const ctx = setup();

    await ctx.remove.execute({ ...ctx.input, targetUserId: MEMBER_USER_ID });

    expect(ctx.membershipAdmin.events[0]?.action).toBe('REMOVED');
  });

  it('reactivates a suspended member', async () => {
    const ctx = setup([
      membershipRecord({ userId: USER_ID, role: 'ADMIN', status: 'ACTIVE' }),
      membershipRecord({ userId: MEMBER_USER_ID, role: 'MEMBER', status: 'SUSPENDED' }),
    ]);

    await ctx.reactivate.execute({
      ...ctx.input,
      targetUserId: MEMBER_USER_ID,
    });

    expect(ctx.membershipAdmin.members.get(`${ctx.workspace.id}:${MEMBER_USER_ID}`)?.status).toBe(
      'ACTIVE'
    );
  });
});

describe('AddWorkspaceMemberUseCase', () => {
  it('adds an existing tenant user by handle', async () => {
    const ctx = setup();

    await ctx.add.execute({
      ...ctx.input,
      handle: 'newcomer',
      role: 'MODERATOR',
    });

    expect(
      ctx.membershipAdmin.members.get(`${ctx.workspace.id}:${NEW_USER_ID}`)?.role
    ).toBe('MODERATOR');
    expect(ctx.membershipAdmin.events[0]?.action).toBe('ADDED');
  });

  it('adds an existing tenant user by global user (globalUserId)', async () => {
    const ctx = setup();

    await ctx.add.execute({
      ...ctx.input,
      globalUserId: 'global-new-user',
      role: 'MEMBER',
    });

    expect(
      ctx.membershipAdmin.members.get(`${ctx.workspace.id}:${NEW_USER_ID}`)?.role
    ).toBe('MEMBER');
    expect(ctx.membershipAdmin.events[0]?.action).toBe('ADDED');
  });

  it('refuses a handle that never signed in', async () => {
    const ctx = setup();

    await expect(
      ctx.add.execute({
        ...ctx.input,
        handle: 'stranger',
        role: 'MEMBER',
      })
    ).rejects.toMatchObject({ code: 'ERR_USER_NOT_FOUND' });
  });

  it('refuses a globalUserId without tenant link', async () => {
    const ctx = setup();

    await expect(
      ctx.add.execute({
        ...ctx.input,
        globalUserId: 'global-orphan',
        role: 'MEMBER',
      })
    ).rejects.toMatchObject({ code: 'ERR_USER_NOT_FOUND' });
  });

  it('refuses a user who is already an active member', async () => {
    const ctx = setup();

    await expect(
      ctx.add.execute({
        ...ctx.input,
        handle: 'other',
        role: 'ADMIN',
      })
    ).rejects.toMatchObject({ code: 'ERR_ALREADY_MEMBER' });
  });
});
