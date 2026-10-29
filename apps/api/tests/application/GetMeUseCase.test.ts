import { describe, expect, it } from 'vitest';
import { GetMeUseCase } from '../../src/application/use_cases/GetMeUseCase.js';
import { AUTH_USER, TENANT_ID, makeRouterDb, makeUserRepository } from '../support/authFakes.js';

describe('GetMeUseCase', () => {
  const workspaces = [
    {
      id: '22222222-2222-4222-8222-222222222222',
      slug: 'general',
      name: 'General',
      role: 'ADMIN' as const,
    },
  ];

  it('returns the caller profile and workspace memberships', async () => {
    const { userRepo } = makeUserRepository({ workspaces });
    const useCase = new GetMeUseCase(userRepo);

    const result = await useCase.execute({
      userId: AUTH_USER.id,
      tid: TENANT_ID,
    });

    expect(result.user).toEqual(AUTH_USER);
    expect(result.workspaces).toEqual(workspaces);
    // No router injected: no global identity claim, but the field is present.
    expect(result.globalUserId).toBeNull();
  });

  it('resolves the global identity through the router link (v6/TASK-01)', async () => {
    const { userRepo } = makeUserRepository({ workspaces });
    const router = makeRouterDb({ globalUserId: 'global-id-7' });
    const useCase = new GetMeUseCase(userRepo, router.routerDb);

    const result = await useCase.execute({ userId: AUTH_USER.id, tid: TENANT_ID });

    expect(result.globalUserId).toBe('global-id-7');
    expect(router.calls).toContain(
      `findGlobalIdentityForTenantUser:${TENANT_ID}:${AUTH_USER.id}`
    );
  });

  it('returns a null globalUserId when the user has no router link', async () => {
    const { userRepo } = makeUserRepository({ workspaces });
    const router = makeRouterDb();
    const useCase = new GetMeUseCase(userRepo, router.routerDb);

    const result = await useCase.execute({ userId: AUTH_USER.id, tid: TENANT_ID });

    expect(result.globalUserId).toBeNull();
  });

  it('rejects a token whose user row no longer exists', async () => {
    const { userRepo } = makeUserRepository({ user: null });
    const useCase = new GetMeUseCase(userRepo);

    await expect(
      useCase.execute({ userId: AUTH_USER.id, tid: TENANT_ID })
    ).rejects.toMatchObject({ code: 'ERR_INVALID_TOKEN' });
  });
});
