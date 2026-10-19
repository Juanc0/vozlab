import { describe, expect, it } from 'vitest';
import { GetMeUseCase } from '../../src/application/use_cases/GetMeUseCase.js';
import { AUTH_USER, TENANT_ID, makeUserRepository } from '../support/authFakes.js';

describe('GetMeUseCase', () => {
  it('returns the caller profile and workspace memberships', async () => {
    const workspaces = [
      {
        id: '22222222-2222-4222-8222-222222222222',
        slug: 'general',
        name: 'General',
        role: 'ADMIN' as const,
      },
    ];
    const { userRepo } = makeUserRepository({ workspaces });
    const useCase = new GetMeUseCase(userRepo);

    const result = await useCase.execute({
      userId: AUTH_USER.id,
      tid: TENANT_ID,
    });

    expect(result.user).toEqual(AUTH_USER);
    expect(result.workspaces).toEqual(workspaces);
  });

  it('rejects a token whose user row no longer exists', async () => {
    const { userRepo } = makeUserRepository({ user: null });
    const useCase = new GetMeUseCase(userRepo);

    await expect(
      useCase.execute({ userId: AUTH_USER.id, tid: TENANT_ID })
    ).rejects.toMatchObject({ code: 'ERR_INVALID_TOKEN' });
  });
});
