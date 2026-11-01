import { describe, expect, it } from 'vitest';
import { GetWorkspaceUseCase } from '../../src/application/use_cases/GetWorkspaceUseCase.js';
import { DomainError } from '../../src/domain/errors/DomainError.js';
import { AUTH_USER, TENANT_ID, USER_ID, WORKSPACE_ID } from '../support/authFakes.js';
import { makeWorkspaceRepository, workspaceRecord } from '../support/adminFakes.js';
import { makeRoleLookup } from '../support/adminFakes.js';

describe('GetWorkspaceUseCase', () => {
  it('rejects a tenant ADMIN who is not a workspace member', async () => {
    const workspaces = makeWorkspaceRepository([workspaceRecord({ id: WORKSPACE_ID })]);
    const userRepo = { async findById() { return { ...AUTH_USER, systemRole: 'ADMIN' }; } };
    const membershipRepo = makeRoleLookup(null);
    const useCase = new GetWorkspaceUseCase(workspaces.repo, membershipRepo as never, userRepo as never);

    await expect(
      useCase.execute({ actorUserId: USER_ID, tid: TENANT_ID, workspaceId: WORKSPACE_ID })
    ).rejects.toMatchObject({ code: 'ERR_AUTHORIZATION_FAILED' });
  });

  it('lets a workspace ADMIN read the workspace', async () => {
    const workspaces = makeWorkspaceRepository([workspaceRecord({ id: WORKSPACE_ID })]);
    const userRepo = { async findById() { return { ...AUTH_USER, systemRole: 'USER' }; } };
    const membershipRepo = makeRoleLookup(WORKSPACE_ID);
    const useCase = new GetWorkspaceUseCase(workspaces.repo, membershipRepo as never, userRepo as never);

    const result = await useCase.execute({ actorUserId: USER_ID, tid: TENANT_ID, workspaceId: WORKSPACE_ID });
    expect(result.id).toBe(WORKSPACE_ID);
  });
});
