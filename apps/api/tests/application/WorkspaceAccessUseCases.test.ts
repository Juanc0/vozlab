import { describe, expect, it } from 'vitest';
import { ApproveJoinRequestUseCase } from '../../src/application/use_cases/ApproveJoinRequestUseCase.js';
import { RejectJoinRequestUseCase } from '../../src/application/use_cases/RejectJoinRequestUseCase.js';
import { RequestWorkspaceAccessUseCase } from '../../src/application/use_cases/RequestWorkspaceAccessUseCase.js';
import { AUTH_USER, TENANT_ID, USER_ID } from '../support/authFakes.js';
import { makeUnitOfWork } from '../support/fakes.js';
import { hashOpaqueToken } from '../../src/shared/auth/refreshToken.js';
import {
  makeJoinCodeRepository,
  makeJoinRequestRepository,
  makeMembershipAdminRepository,
  makeWorkspaceRepository,
  membershipRecord,
  workspaceRecord,
  joinCodeRecord,
} from '../support/adminFakes.js';

function setup(
  workspaces = makeWorkspaceRepository([workspaceRecord()])
) {
  const joinRequests = makeJoinRequestRepository();
  const membershipAdmin = makeMembershipAdminRepository();
  const userRepo = {
    async findById() {
      return { ...AUTH_USER, systemRole: 'ADMIN' };
    },
  };
  const membershipRepo = {
    async getRole() {
      return null;
    },
  } as never;
  const { uow } = makeUnitOfWork();
  const workspace = [...workspaces.rows.values()][0]!;

  return {
    workspace,
    workspaces,
    joinRequests,
    membershipAdmin,
    requestAccess: new RequestWorkspaceAccessUseCase(
      workspaces.repo,
      joinRequests.repo,
      membershipRepo
    ),
    approve: new ApproveJoinRequestUseCase(
      joinRequests.repo,
      membershipAdmin.repo,
      membershipRepo,
      userRepo as never,
      uow
    ),
    reject: new RejectJoinRequestUseCase(
      joinRequests.repo,
      membershipAdmin.repo,
      membershipRepo,
      userRepo as never,
      uow
    ),
  };
}

describe('RequestWorkspaceAccessUseCase', () => {
  it('creates a PENDING request for a public workspace', async () => {
    const ctx = setup();

    const request = await ctx.requestAccess.execute({
      userId: USER_ID,
      tid: TENANT_ID,
      workspaceId: ctx.workspace.id,
    });

    expect(request.status).toBe('PENDING');
    expect(request.workspaceName).toBe('General');
    expect(ctx.joinRequests.rows.size).toBe(1);
  });

  it('records a JOIN_REQUESTED audit event with tenant and workspace', async () => {
    const ctx = setup();
    const events: Array<Record<string, unknown>> = [];
    const audited = new RequestWorkspaceAccessUseCase(
      ctx.workspaces.repo,
      ctx.joinRequests.repo,
      { async getRole() { return null; } } as never,
      undefined,
      undefined,
      { async record(e) { events.push(e as unknown as Record<string, unknown>); } }
    );

    await audited.execute({
      userId: USER_ID,
      tid: TENANT_ID,
      workspaceId: ctx.workspace.id,
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: USER_ID,
      actorType: 'USER',
      action: 'JOIN_REQUESTED',
      targetType: 'join_request',
      tenantId: TENANT_ID,
      metadata: { workspaceId: ctx.workspace.id, userId: USER_ID },
    });
  });

  it('never reveals a private workspace by id', async () => {
    const ctx = setup(
      makeWorkspaceRepository([workspaceRecord({ isPublic: false })])
    );

    await expect(
      ctx.requestAccess.execute({
        userId: USER_ID,
        tid: TENANT_ID,
        workspaceId: ctx.workspace.id,
      })
    ).rejects.toMatchObject({ code: 'ERR_WORKSPACE_NOT_FOUND' });
  });

  it('accepts a private workspace by join code, still as a request', async () => {
    const ctx = setup(
      makeWorkspaceRepository([workspaceRecord({ isPublic: false })])
    );
    // ADR-0045: the code lives ONLY as a workspace_join_codes row. The
    // redemption is a single consume; a private code only ROUTES a request.
    const raw = 'ABCDEF0123456789ABCDEF';
    const joinCodes = makeJoinCodeRepository([
      joinCodeRecord({ codeHash: hashOpaqueToken(raw) }),
    ]);
    const requestAccess = new RequestWorkspaceAccessUseCase(
      ctx.workspaces.repo,
      ctx.joinRequests.repo,
      { async getRole() { return null; } } as never,
      undefined,
      joinCodes.repo,
      undefined,
      undefined
    );

    const request = await requestAccess.execute({
      userId: USER_ID,
      tid: TENANT_ID,
      code: raw,
    });

    expect(request.status).toBe('PENDING');
    expect(ctx.membershipAdmin.members.size).toBe(0);
    expect(joinCodes.consumes).toEqual([{ codeHash: hashOpaqueToken(raw), ok: true }]);
  });

  it('an exhausted code never reaches the request stage', async () => {
    const ctx = setup(makeWorkspaceRepository([workspaceRecord({ isPublic: false })]));
    const raw = 'FEEDFACEFEEDFACEFEEDFACE';
    const joinCodes = makeJoinCodeRepository([
      joinCodeRecord({
        codeHash: hashOpaqueToken(raw),
        maxUses: 1,
        usedCount: 1,
      }),
    ]);
    const requestAccess = new RequestWorkspaceAccessUseCase(
      ctx.workspaces.repo,
      ctx.joinRequests.repo,
      { async getRole() { return null; } } as never,
      undefined,
      joinCodes.repo
    );

    await expect(
      requestAccess.execute({ userId: USER_ID, tid: TENANT_ID, code: raw })
    ).rejects.toMatchObject({ code: 'ERR_WORKSPACE_NOT_FOUND' });
    expect(ctx.joinRequests.rows.size).toBe(0);
  });

  it('reuses the pending request instead of duplicating it', async () => {
    const ctx = setup();
    const input = { userId: USER_ID, tid: TENANT_ID, workspaceId: ctx.workspace.id };

    const first = await ctx.requestAccess.execute(input);
    const second = await ctx.requestAccess.execute(input);

    expect(second.id).toBe(first.id);
    expect(ctx.joinRequests.rows.size).toBe(1);
  });
});

describe('ApproveJoinRequestUseCase / RejectJoinRequestUseCase', () => {
  it('approves the request and creates the membership in one transaction', async () => {
    const ctx = setup();
    const request = await ctx.requestAccess.execute({
      userId: USER_ID,
      tid: TENANT_ID,
      workspaceId: ctx.workspace.id,
    });

    await ctx.approve.execute({
      actorUserId: USER_ID,
      tid: TENANT_ID,
      workspaceId: ctx.workspace.id,
      requestId: request.id,
      role: 'MEMBER',
    });

    expect(ctx.joinRequests.rows.get(request.id)?.status).toBe('APPROVED');
    expect(
      ctx.membershipAdmin.members.get(`${ctx.workspace.id}:${USER_ID}`)?.role
    ).toBe('MEMBER');
    expect(ctx.membershipAdmin.events[0]?.action).toBe('JOIN_APPROVED');
  });

  it('refuses to approve a request twice', async () => {
    const ctx = setup();
    const request = await ctx.requestAccess.execute({
      userId: USER_ID,
      tid: TENANT_ID,
      workspaceId: ctx.workspace.id,
    });
    const input = {
      actorUserId: USER_ID,
      tid: TENANT_ID,
      workspaceId: ctx.workspace.id,
      requestId: request.id,
      role: 'MEMBER' as const,
    };
    await ctx.approve.execute(input);

    await expect(ctx.approve.execute(input)).rejects.toMatchObject({
      code: 'ERR_JOIN_REQUEST_NOT_PENDING',
    });
  });

  it('rejects without creating a membership', async () => {
    const ctx = setup();
    const request = await ctx.requestAccess.execute({
      userId: USER_ID,
      tid: TENANT_ID,
      workspaceId: ctx.workspace.id,
    });

    await ctx.reject.execute({
      actorUserId: USER_ID,
      tid: TENANT_ID,
      workspaceId: ctx.workspace.id,
      requestId: request.id,
    });

    expect(ctx.joinRequests.rows.get(request.id)?.status).toBe('REJECTED');
    expect(ctx.membershipAdmin.members.size).toBe(0);
  });

  it('answers not found for a request of another workspace', async () => {
    const ctx = setup();
    const request = await ctx.requestAccess.execute({
      userId: USER_ID,
      tid: TENANT_ID,
      workspaceId: ctx.workspace.id,
    });

    await expect(
      ctx.reject.execute({
        actorUserId: USER_ID,
        tid: TENANT_ID,
        workspaceId: '99999999-9999-4999-8999-999999999999',
        requestId: request.id,
      })
    ).rejects.toMatchObject({ code: 'ERR_JOIN_REQUEST_NOT_FOUND' });
  });
});

describe('approved member already inside the workspace', () => {
  it('keeps the existing role instead of demoting an ADMIN', async () => {
    const ctx = setup();
    ctx.membershipAdmin.members.set(`${ctx.workspace.id}:${USER_ID}`, {
      ...membershipRecord({ userId: USER_ID, role: 'ADMIN' }),
      workspaceId: ctx.workspace.id,
    });
    // A request only exists for a non-member, so put the row directly.
    const request = await ctx.joinRequests.repo.create(
      { workspaceId: ctx.workspace.id, userId: USER_ID, message: null },
      TENANT_ID
    );

    await ctx.approve.execute({
      actorUserId: USER_ID,
      tid: TENANT_ID,
      workspaceId: ctx.workspace.id,
      requestId: request.id,
      role: 'MEMBER',
    });

    expect(
      ctx.membershipAdmin.members.get(`${ctx.workspace.id}:${USER_ID}`)?.role
    ).toBe('ADMIN');
  });
});
