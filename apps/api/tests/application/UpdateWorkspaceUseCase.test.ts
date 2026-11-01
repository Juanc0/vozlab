import { describe, expect, it } from 'vitest';
import { UpdateWorkspaceUseCase } from '../../src/application/use_cases/UpdateWorkspaceUseCase.js';
import { AUTH_USER, TENANT_ID, USER_ID, WORKSPACE_ID } from '../support/authFakes.js';
import { makeWorkspaceRepository, workspaceRecord } from '../support/adminFakes.js';
import { makeRoleLookup } from '../support/adminFakes.js';

describe('UpdateWorkspaceUseCase', () => {
  it('rejects a tenant ADMIN who is not a workspace member', async () => {
    const workspaces = makeWorkspaceRepository([workspaceRecord({ id: WORKSPACE_ID })]);
    const userRepo = { async findById() { return { ...AUTH_USER, systemRole: 'ADMIN' }; } };
    const membershipRepo = makeRoleLookup(null);
    const useCase = new UpdateWorkspaceUseCase(workspaces.repo, membershipRepo as never, userRepo as never);

    await expect(
      useCase.execute({ actorUserId: USER_ID, tid: TENANT_ID, workspaceId: WORKSPACE_ID, patch: { name: 'X' } })
    ).rejects.toMatchObject({ code: 'ERR_AUTHORIZATION_FAILED' });
  });

  it('lets a workspace ADMIN update the workspace', async () => {
    const workspaces = makeWorkspaceRepository([workspaceRecord({ id: WORKSPACE_ID })]);
    const userRepo = { async findById() { return { ...AUTH_USER, systemRole: 'USER' }; } };
    const membershipRepo = makeRoleLookup(WORKSPACE_ID);
    const useCase = new UpdateWorkspaceUseCase(workspaces.repo, membershipRepo as never, userRepo as never);

    const result = await useCase.execute({ actorUserId: USER_ID, tid: TENANT_ID, workspaceId: WORKSPACE_ID, patch: { name: 'X' } });
    expect(result.id).toBe(WORKSPACE_ID);
  });
});
