import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CreateInvitationUseCase,
  INVITATION_MAX_USES,
  INVITATION_TTL_MS,
} from '../../src/application/use_cases/CreateInvitationUseCase.js';
import { hashEmail } from '../../src/shared/auth/refreshToken.js';
import { ListInvitationsUseCase } from '../../src/application/use_cases/ListInvitationsUseCase.js';
import { RevokeInvitationUseCase } from '../../src/application/use_cases/RevokeInvitationUseCase.js';
import { AUTH_USER, TENANT_ID, USER_ID } from '../support/authFakes.js';
import { makeUnitOfWork } from '../support/fakes.js';
import {
  invitationRecord,
  makeInvitationAdminRepository,
  makeMembershipAdminRepository,
  makeWorkspaceRepository,
  membershipRecord,
  workspaceRecord,
} from '../support/adminFakes.js';

const PEPPER = 'unit-test-pepper-at-least-32-characters!!';

function setup(initial = [invitationRecord()]) {
  const invitations = makeInvitationAdminRepository(initial);
  const membershipAdmin = makeMembershipAdminRepository();
  const workspace = workspaceRecord();
  const workspaces = makeWorkspaceRepository([workspace]);
  const created: Array<{ workspaceId: string; tokenHash: string; emailHash?: string | null }> = [];
  const invitationRepo = {
    async create(input: never) {
      created.push(input as never);
      const row = input as {
        workspaceId: string;
        tokenHash: string;
        emailHash?: string | null;
        maxUses?: number | null;
        expiresAt: Date;
      };
      return invitationRecord({
        id: `inv-${created.length + 10}`,
        workspaceId: row.workspaceId,
        tokenHash: row.tokenHash,
        emailHash: row.emailHash ?? null,
        maxUses: row.maxUses ?? null,
        expiresAt: row.expiresAt,
      });
    },
  } as never;
  const userRepo = {
    async findById() {
      return { ...AUTH_USER, systemRole: 'ADMIN' };
    },
  };
  const membershipRepo = {
    async getRole() {
      return 'ADMIN' as const;
    },
  } as never;
  const { uow } = makeUnitOfWork();

  return {
    workspace,
    workspaces,
    invitations,
    created,
    create: new CreateInvitationUseCase(
      invitationRepo,
      invitations.repo,
      membershipAdmin.repo,
      membershipRepo,
      userRepo as never,
      uow,
      PEPPER
    ),
    list: new ListInvitationsUseCase(
      invitations.repo,
      membershipRepo,
      userRepo as never
    ),
    revoke: new RevokeInvitationUseCase(
      invitations.repo,
      membershipAdmin.repo,
      membershipRepo,
      userRepo as never
    ),
  };
}

describe('CreateInvitationUseCase', () => {
  it('stores only the hash of a single-use, email-bound token', async () => {
    const ctx = setup([]);

    const { invitation, token } = await ctx.create.execute({
      actorUserId: USER_ID,
      actorAuthorHash: AUTH_USER.authorHash,
      tid: TENANT_ID,
      workspaceId: ctx.workspace.id,
      email: '  Invitee@Example.EDU ',
      role: 'MEMBER',
    });

    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(invitation.tokenHash).toBe(
      createHash('sha256').update(token).digest('hex')
    );
    expect(invitation.maxUses).toBe(INVITATION_MAX_USES);
    const ttl = invitation.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(INVITATION_TTL_MS - 5_000);
    expect(ttl).toBeLessThanOrEqual(INVITATION_TTL_MS);
    // DEC-4: no cleartext email anywhere in the persisted shape.
    expect(ctx.created[0]).not.toHaveProperty('email');
  });

  it('revokes the previous pending invitation for the same email hash', async () => {
    const ctx = setup([
      invitationRecord({
        id: 'old',
        emailHash: hashEmail('  Invitee@Example.EDU ', PEPPER),
      }),
    ]);

    await ctx.create.execute({
      actorUserId: USER_ID,
      actorAuthorHash: AUTH_USER.authorHash,
      tid: TENANT_ID,
      workspaceId: ctx.workspace.id,
      email: 'invitee@example.edu',
      role: 'MEMBER',
    });

    const old = ctx.invitations.invitations.find((row) => row.id === 'old');
    expect(old?.status).toBe('REVOKED');
  });

  it('binds the invitation to the peppered normalized email hash', async () => {
    const ctx = setup([]);

    const { invitation } = await ctx.create.execute({
      actorUserId: USER_ID,
      actorAuthorHash: AUTH_USER.authorHash,
      tid: TENANT_ID,
      workspaceId: ctx.workspace.id,
      email: 'Invitee@Example.EDU',
      role: 'MEMBER',
    });

    // The hash rule is trim+lower, then HMAC with the pepper (DEC-4): the
    // same address written differently binds to the same hash.
    expect(invitation.emailHash).toBe(
      hashEmail('invitee@example.edu', PEPPER)
    );
  });
});

describe('RevokeInvitationUseCase', () => {
  it('revokes a pending invitation of the workspace', async () => {
    const ctx = setup();

    await ctx.revoke.execute({
      actorUserId: USER_ID,
      tid: TENANT_ID,
      workspaceId: ctx.workspace.id,
      invitationId: 'inv-1',
    });

    expect(ctx.invitations.invitations[0]?.status).toBe('REVOKED');
  });

  it('answers not found for an invitation of another workspace', async () => {
    const ctx = setup([
      invitationRecord({ workspaceId: '99999999-9999-4999-8999-999999999999' }),
    ]);

    await expect(
      ctx.revoke.execute({
        actorUserId: USER_ID,
        tid: TENANT_ID,
        workspaceId: ctx.workspace.id,
        invitationId: 'inv-1',
      })
    ).rejects.toMatchObject({ code: 'ERR_INVITATION_NOT_FOUND' });
  });

  it('refuses to revoke an already accepted invitation', async () => {
    const ctx = setup([invitationRecord({ status: 'ACCEPTED' })]);

    await expect(
      ctx.revoke.execute({
        actorUserId: USER_ID,
        tid: TENANT_ID,
        workspaceId: ctx.workspace.id,
        invitationId: 'inv-1',
      })
    ).rejects.toMatchObject({ code: 'ERR_INVITATION_NOT_PENDING' });
  });
});

describe('ListInvitationsUseCase', () => {
  it('lists the invitations of the workspace without tokens', async () => {
    const ctx = setup([invitationRecord()]);

    const rows = await ctx.list.execute({
      actorUserId: USER_ID,
      tid: TENANT_ID,
      workspaceId: ctx.workspace.id,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('token');
  });
});
