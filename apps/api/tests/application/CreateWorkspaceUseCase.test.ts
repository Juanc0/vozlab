import { describe, expect, it } from 'vitest';
import { CreateWorkspaceUseCase } from '../../src/application/use_cases/CreateWorkspaceUseCase.js';
import type { IOntologyRepository } from '../../src/domain/ports/IOntologyRepository.js';
import { AUTH_USER, TENANT_ID, USER_ID } from '../support/authFakes.js';
import { makeUnitOfWork } from '../support/fakes.js';
import {
  makeMembershipAdminRepository,
  makeWorkspaceRepository,
  workspaceRecord,
} from '../support/adminFakes.js';

function setup(
  actor: { systemRole: string } = { systemRole: 'ADMIN' },
  workspaces = makeWorkspaceRepository()
) {
  const memberships = makeMembershipAdminRepository();
  const userRepo = {
    async findById() {
      return { ...AUTH_USER, systemRole: actor.systemRole };
    },
  };
  const { uow } = makeUnitOfWork();
  const savedClasses: unknown[] = [];
  const savedRelations: unknown[] = [];
  const ontologyRepo = {
    async saveClass(cls: unknown) {
      savedClasses.push(cls);
    },
    async saveObjectProperty(relation: unknown) {
      savedRelations.push(relation);
    },
  } as unknown as IOntologyRepository;

  const useCase = new CreateWorkspaceUseCase(
    workspaces.repo,
    memberships.repo,
    ontologyRepo,
    userRepo as never,
    uow
  );

  return { useCase, workspaces, memberships, savedClasses, savedRelations };
}

describe('CreateWorkspaceUseCase', () => {
  it('creates the workspace, its base ontology and the creator ADMIN in one transaction', async () => {
    const { useCase, workspaces, memberships, savedClasses, savedRelations } =
      setup();

    const created = await useCase.execute({
      actorUserId: USER_ID,
      actorAuthorHash: AUTH_USER.authorHash,
      tid: TENANT_ID,
      name: 'Research',
      slug: 'research',
      description: null,
      isPublic: true,
    });

    expect(created.slug).toBe('research');
    expect(workspaces.rows.size).toBe(1);
    expect(workspaces.rows.get(created.id)?.joinCode).toMatch(/^[0-9A-F]{16}$/);
    expect(savedClasses).toHaveLength(3);
    expect(savedRelations).toHaveLength(5);
    expect(memberships.members.get(`${created.id}:${USER_ID}`)?.role).toBe(
      'ADMIN'
    );
    expect(memberships.events[0]?.action).toBe('WORKSPACE_CREATED');
  });

  it('refuses a slug that already names a workspace', async () => {
    const existing = workspaceRecord({ id: 'ws-existing', slug: 'research' });
    const workspaces = makeWorkspaceRepository([existing]);
    const { useCase } = setup(undefined, workspaces);

    await expect(
      useCase.execute({
        actorUserId: USER_ID,
        actorAuthorHash: AUTH_USER.authorHash,
        tid: TENANT_ID,
        name: 'Research',
        slug: 'research',
        description: null,
        isPublic: true,
      })
    ).rejects.toMatchObject({ code: 'ERR_WORKSPACE_SLUG_TAKEN' });
  });

  it('refuses a caller who is not a tenant ADMIN', async () => {
    const { useCase } = setup({ systemRole: 'USER' });

    await expect(
      useCase.execute({
        actorUserId: USER_ID,
        actorAuthorHash: AUTH_USER.authorHash,
        tid: TENANT_ID,
        name: 'Research',
        slug: 'research',
        description: null,
        isPublic: true,
      })
    ).rejects.toMatchObject({ code: 'ERR_AUTHORIZATION_FAILED' });
  });
});
