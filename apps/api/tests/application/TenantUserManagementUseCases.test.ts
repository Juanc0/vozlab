import { describe, expect, it } from 'vitest';
import { UpdateTenantUserSystemRoleUseCase } from '../../src/application/use_cases/UpdateTenantUserSystemRoleUseCase.js';
import { SuspendTenantUserUseCase } from '../../src/application/use_cases/SuspendTenantUserUseCase.js';
import { ActivateTenantUserUseCase } from '../../src/application/use_cases/ActivateTenantUserUseCase.js';
import { AUTH_USER, TENANT_ID, USER_ID } from '../support/authFakes.js';
import { makeUserRepository } from '../support/authFakes.js';
import { makeAuditLog } from '../support/authFakes.js';

const TARGET_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ADMIN_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeUserRepoFor(
  actorRole: string,
  targetProvider = 'OIDC_INSTITUTIONAL',
  systemAdminCount = 1
) {
  const repo = {
    async findById(userId: string) {
      if (userId === USER_ID) {
        return { ...AUTH_USER, id: USER_ID, systemRole: actorRole };
      }
      if (userId === TARGET_USER_ID) {
        return {
          ...AUTH_USER,
          id: TARGET_USER_ID,
          systemRole: 'USER',
          provider: targetProvider,
        };
      }
      return null;
    },
    async updateSystemRole(userId: string, systemRole: string, tid: string) {
      return { ...AUTH_USER, id: userId, systemRole };
    },
    async setSessionsValidAfter() {},
    async countSystemAdmins() {
      return systemAdminCount;
    },
  };
  return repo;
}

describe('UpdateTenantUserSystemRoleUseCase', () => {
  it('promotes a tenant user', async () => {
    const userRepo = makeUserRepoFor('ADMIN');
    const uc = new UpdateTenantUserSystemRoleUseCase(userRepo as never);
    const result = await uc.execute({
      actorUserId: USER_ID,
      tid: TENANT_ID,
      userId: TARGET_USER_ID,
      systemRole: 'ADMIN',
    });
    expect(result.systemRole).toBe('ADMIN');
  });

  it('refuses self-demotion of the last tenant admin', async () => {
    const userRepo = makeUserRepoFor('ADMIN', 'OIDC_INSTITUTIONAL', 1);
    // make findById return admin for USER_ID
    const uc = new UpdateTenantUserSystemRoleUseCase(userRepo as never);
    await expect(
      uc.execute({
        actorUserId: USER_ID,
        tid: TENANT_ID,
        userId: USER_ID,
        systemRole: 'USER',
      })
    ).rejects.toMatchObject({ code: 'ERR_LAST_TENANT_ADMIN' });
  });

  it('allows self-demotion when another admin remains', async () => {
    const userRepo = makeUserRepoFor('ADMIN', 'OIDC_INSTITUTIONAL', 2);
    const uc = new UpdateTenantUserSystemRoleUseCase(userRepo as never);
    const result = await uc.execute({
      actorUserId: USER_ID,
      tid: TENANT_ID,
      userId: USER_ID,
      systemRole: 'USER',
    });
    expect(result.systemRole).toBe('USER');
  });

  it('refuses anonymous-event users', async () => {
    const userRepo = makeUserRepoFor('ADMIN', 'ANONYMOUS_EVENT', 1);
    const uc = new UpdateTenantUserSystemRoleUseCase(userRepo as never);
    await expect(
      uc.execute({
        actorUserId: USER_ID,
        tid: TENANT_ID,
        userId: TARGET_USER_ID,
        systemRole: 'ADMIN',
      })
    ).rejects.toMatchObject({ code: 'ERR_USER_NOT_FOUND' });
  });

  it('refuses non-admin actor', async () => {
    const userRepo = makeUserRepoFor('USER');
    const uc = new UpdateTenantUserSystemRoleUseCase(userRepo as never);
    await expect(
      uc.execute({
        actorUserId: USER_ID,
        tid: TENANT_ID,
        userId: TARGET_USER_ID,
        systemRole: 'ADMIN',
      })
    ).rejects.toMatchObject({ code: 'ERR_AUTHORIZATION_FAILED' });
  });

  it('refuses unknown user', async () => {
    const userRepo = makeUserRepoFor('ADMIN');
    const uc = new UpdateTenantUserSystemRoleUseCase(userRepo as never);
    await expect(
      uc.execute({
        actorUserId: USER_ID,
        tid: TENANT_ID,
        userId: '99999999-9999-4999-8999-999999999999',
        systemRole: 'ADMIN',
      })
    ).rejects.toMatchObject({ code: 'ERR_USER_NOT_FOUND' });
  });
});

describe('SuspendTenantUserUseCase', () => {
  it('suspends a user and stamps sessionsValidAfter', async () => {
    const calls: Array<{ userId: string; value: Date | null; tid: string }> = [];
    const userRepo = {
      async findById(userId: string) {
        if (userId === USER_ID) return { ...AUTH_USER, id: USER_ID, systemRole: 'ADMIN' };
        if (userId === TARGET_USER_ID) return { ...AUTH_USER, id: TARGET_USER_ID, systemRole: 'USER' };
        return null;
      },
      async setSessionsValidAfter(userId: string, value: Date | null, tid: string) {
        calls.push({ userId, value, tid });
      },
    };
    const uc = new SuspendTenantUserUseCase(userRepo as never);
    await uc.execute({
      actorUserId: USER_ID,
      tid: TENANT_ID,
      userId: TARGET_USER_ID,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].userId).toBe(TARGET_USER_ID);
    expect(calls[0].value).toBeInstanceOf(Date);
  });

  it('refuses self-suspension', async () => {
    const userRepo = {
      async findById(userId: string) {
        return { ...AUTH_USER, id: userId, systemRole: 'ADMIN' };
      },
      async setSessionsValidAfter() {},
    };
    const uc = new SuspendTenantUserUseCase(userRepo as never);
    await expect(
      uc.execute({ actorUserId: USER_ID, tid: TENANT_ID, userId: USER_ID })
    ).rejects.toMatchObject({ code: 'ERR_CANNOT_MODIFY_SELF' });
  });

  it('refuses non-admin actor', async () => {
    const userRepo = {
      async findById(userId: string) {
        return { ...AUTH_USER, id: userId, systemRole: 'USER' };
      },
      async setSessionsValidAfter() {},
    };
    const uc = new SuspendTenantUserUseCase(userRepo as never);
    await expect(
      uc.execute({ actorUserId: USER_ID, tid: TENANT_ID, userId: TARGET_USER_ID })
    ).rejects.toMatchObject({ code: 'ERR_AUTHORIZATION_FAILED' });
  });

  it('refuses anonymous-event users', async () => {
    const userRepo = {
      async findById(userId: string) {
        if (userId === USER_ID) return { ...AUTH_USER, id: USER_ID, systemRole: 'ADMIN' };
        return { ...AUTH_USER, id: userId, systemRole: 'USER', provider: 'ANONYMOUS_EVENT' };
      },
      async setSessionsValidAfter() {},
    };
    const uc = new SuspendTenantUserUseCase(userRepo as never);
    await expect(
      uc.execute({ actorUserId: USER_ID, tid: TENANT_ID, userId: TARGET_USER_ID })
    ).rejects.toMatchObject({ code: 'ERR_USER_NOT_FOUND' });
  });

  it('refuses unknown user', async () => {
    const userRepo = {
      async findById(userId: string) {
        if (userId === USER_ID) return { ...AUTH_USER, id: USER_ID, systemRole: 'ADMIN' };
        return null;
      },
      async setSessionsValidAfter() {},
    };
    const uc = new SuspendTenantUserUseCase(userRepo as never);
    await expect(
      uc.execute({ actorUserId: USER_ID, tid: TENANT_ID, userId: TARGET_USER_ID })
    ).rejects.toMatchObject({ code: 'ERR_USER_NOT_FOUND' });
  });
});

describe('ActivateTenantUserUseCase', () => {
  it('clears sessionsValidAfter', async () => {
    const calls: Array<{ userId: string; value: Date | null; tid: string }> = [];
    const userRepo = {
      async findById(userId: string) {
        if (userId === USER_ID) return { ...AUTH_USER, id: USER_ID, systemRole: 'ADMIN' };
        if (userId === TARGET_USER_ID) return { ...AUTH_USER, id: TARGET_USER_ID, systemRole: 'USER' };
        return null;
      },
      async setSessionsValidAfter(userId: string, value: Date | null, tid: string) {
        calls.push({ userId, value, tid });
      },
    };
    const uc = new ActivateTenantUserUseCase(userRepo as never);
    await uc.execute({ actorUserId: USER_ID, tid: TENANT_ID, userId: TARGET_USER_ID });
    expect(calls).toHaveLength(1);
    expect(calls[0].value).toBeNull();
  });

  it('refuses non-admin actor', async () => {
    const userRepo = {
      async findById(userId: string) {
        return { ...AUTH_USER, id: userId, systemRole: 'USER' };
      },
      async setSessionsValidAfter() {},
    };
    const uc = new ActivateTenantUserUseCase(userRepo as never);
    await expect(
      uc.execute({ actorUserId: USER_ID, tid: TENANT_ID, userId: TARGET_USER_ID })
    ).rejects.toMatchObject({ code: 'ERR_AUTHORIZATION_FAILED' });
  });
});