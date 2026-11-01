import { describe, expect, it } from 'vitest';
import { CreateWorkspaceUseCase } from '../../src/application/use_cases/CreateWorkspaceUseCase.js';
import type { IOntologyRepository } from '../../src/domain/ports/IOntologyRepository.js';
import { AUTH_USER, TENANT_ID, USER_ID } from '../support/authFakes.js';

const TARGET_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
import { makeUnitOfWork } from '../support/fakes.js';
import {
  makeJoinCodeRepository,
  makeMembershipAdminRepository,
  makeWorkspaceRepository,
  workspaceRecord,
} from '../support/adminFakes.js';

function setup(
  actor: { systemRole: string } = { systemRole: 'ADMIN' },
  workspaces = makeWorkspaceRepository(),
  userRepoOverride?: { findById: (userId: string, tid: string) => Promise<{ systemRole: string; provider: string } | null> }
) {
  const memberships = makeMembershipAdminRepository();
  const joinCodes = makeJoinCodeRepository();
  const userRepo = userRepoOverride ?? {
    async findById() {
      return { ...AUTH_USER, systemRole: actor.systemRole, provider: 'OIDC_INSTITUTIONAL' };
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
    uow,
    joinCodes.repo
  );

  return { useCase, workspaces, memberships, joinCodes, savedClasses, savedRelations };
}

describe('CreateWorkspaceUseCase', () => {
  it('creates the workspace, its default join code, the base ontology and the creator ADMIN in one transaction', async () => {
    const { useCase, workspaces, memberships, joinCodes, savedClasses, savedRelations } =
      setup();

    const result = await useCase.execute({
      actorUserId: USER_ID,
      actorAuthorHash: AUTH_USER.authorHash,
      tid: TENANT_ID,
      name: 'Research',
      slug: 'research',
      description: null,
      isPublic: true,
    });

    const created = result.workspace;
    expect(created.slug).toBe('research');
    expect(workspaces.rows.size).toBe(1);
    expect(savedClasses).toHaveLength(3);
    expect(savedRelations).toHaveLength(5);
    expect(memberships.members.get(`${created.id}:${USER_ID}`)?.role).toBe(
      'ADMIN'
    );
    expect(memberships.events[0]?.action).toBe('WORKSPACE_CREATED');

    // ADR-0045: the workspace ships with exactly one join-code row — the
    // default, never auto-approving, attributed to the creator pseudonym.
    // The raw code is revealed once, in the result, and never on the row.
    expect(joinCodes.creates).toHaveLength(1);
    expect(joinCodes.creates[0]).toMatchObject({
      workspaceId: created.id,
      label: 'default',
      autoApprove: false,
      createdByHash: AUTH_USER.authorHash,
    });
    expect(joinCodes.creates[0].codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.joinCode).toMatch(/^[0-9A-F]{24}$/);
    expect(joinCodes.creates[0].codeHash).not.toContain(result.joinCode);
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

  it('appoints an initial admin and gives the creator no membership', async () => {
    const { useCase, memberships } = setup();

    const result = await useCase.execute({
      actorUserId: USER_ID,
      actorAuthorHash: AUTH_USER.authorHash,
      tid: TENANT_ID,
      name: 'Research',
      slug: 'research',
      description: null,
      isPublic: true,
      initialAdminUserId: TARGET_USER_ID,
    });

    const created = result.workspace;
    expect(memberships.members.get(`${created.id}:${TARGET_USER_ID}`)?.role).toBe('ADMIN');
    expect(memberships.members.has(`${created.id}:${USER_ID}`)).toBe(false);
  });

  it('rejects an unknown initial admin', async () => {
    const { useCase } = setup(
      { systemRole: 'ADMIN' },
      makeWorkspaceRepository(),
      {
        async findById(userId: string) {
          if (userId === TARGET_USER_ID) return null;
          return { ...AUTH_USER, systemRole: 'ADMIN', provider: 'OIDC_INSTITUTIONAL' };
        },
      }
    );

    await expect(
      useCase.execute({
        actorUserId: USER_ID,
        actorAuthorHash: AUTH_USER.authorHash,
        tid: TENANT_ID,
        name: 'Research',
        slug: 'research',
        description: null,
        isPublic: true,
        initialAdminUserId: TARGET_USER_ID,
      })
    ).rejects.toMatchObject({ code: 'ERR_USER_NOT_FOUND' });
  });

  it('rejects an anonymous-event initial admin', async () => {
    const { useCase } = setup(
      { systemRole: 'ADMIN' },
      makeWorkspaceRepository(),
      {
        async findById(userId: string) {
          if (userId === TARGET_USER_ID) {
            return { ...AUTH_USER, id: TARGET_USER_ID, systemRole: 'USER', provider: 'ANONYMOUS_EVENT' };
          }
          return { ...AUTH_USER, systemRole: 'ADMIN', provider: 'OIDC_INSTITUTIONAL' };
        },
      }
    );

    await expect(
      useCase.execute({
        actorUserId: USER_ID,
        actorAuthorHash: AUTH_USER.authorHash,
        tid: TENANT_ID,
        name: 'Research',
        slug: 'research',
        description: null,
        isPublic: true,
        initialAdminUserId: TARGET_USER_ID,
      })
    ).rejects.toMatchObject({ code: 'ERR_USER_NOT_FOUND' });
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
