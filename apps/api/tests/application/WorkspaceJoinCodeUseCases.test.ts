import { describe, expect, it } from 'vitest';
import { CreateWorkspaceJoinCodeUseCase } from '../../src/application/use_cases/CreateWorkspaceJoinCodeUseCase.js';
import { RotateJoinCodeUseCase } from '../../src/application/use_cases/RotateJoinCodeUseCase.js';
import type { AuditEvent } from '../../src/domain/ports/IAuditLog.js';
import type { WorkspaceJoinCodeRecord } from '../../src/domain/ports/IWorkspaceJoinCodeRepository.js';
import { AUTH_USER, TENANT_ID, USER_ID, WORKSPACE_ID } from '../support/authFakes.js';
import { workspaceRecord } from '../support/adminFakes.js';

function makeAudit(): { events: AuditEvent[]; record: (e: AuditEvent) => Promise<void> } {
  const events: AuditEvent[] = [];
  return {
    events,
    async record(e) {
      events.push(e);
    },
  };
}

const adminUserRepo = {
  async findById() {
    return { ...AUTH_USER, systemRole: 'ADMIN' };
  },
  async findByHandle() {
    return null;
  },
  async findOrCreateOidcUser() {
    return AUTH_USER;
  },
  async findOrCreateByExternalIdentity() {
    return AUTH_USER;
  },
  async createAnonymousUser() {
    return AUTH_USER;
  },
  async listWorkspaces() {
    return [];
  },
};
const membershipRepo = {
  async getRole() {
    return 'ADMIN' as const;
  },
};

function codeRecord(): WorkspaceJoinCodeRecord {
  return {
    id: 'code-1',
    workspaceId: WORKSPACE_ID,
    codeHash: 'hash-1',
    label: 'meetup',
    expiresAt: new Date('2030-01-01'),
    maxUses: 5,
    usedCount: 0,
    autoApprove: false,
    revokedAt: null,
    createdBy: USER_ID,
    createdAt: new Date(),
  };
}

describe('CreateWorkspaceJoinCodeUseCase', () => {
  it('records a JOIN_CODE_CREATED audit event without the raw code', async () => {
    const created: WorkspaceJoinCodeRecord[] = [];
    const codeRepo = {
      async create(input: Omit<WorkspaceJoinCodeRecord, 'id' | 'usedCount' | 'revokedAt' | 'createdAt'>) {
        const record = { ...codeRecord(), ...input } as WorkspaceJoinCodeRecord;
        created.push(record);
        return record;
      },
    };
    const audit = makeAudit();
    const useCase = new CreateWorkspaceJoinCodeUseCase(
      codeRepo as never,
      adminUserRepo as never,
      membershipRepo as never,
      audit
    );

    const result = await useCase.execute({
      actorUserId: USER_ID,
      tid: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      label: 'meetup',
      maxUses: 5,
      expiresAt: new Date('2030-01-01'),
    });

    expect(created).toHaveLength(1);
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      actorId: USER_ID,
      actorType: 'ADMIN',
      action: 'JOIN_CODE_CREATED',
      targetType: 'join_code',
      targetId: 'code-1',
      tenantId: TENANT_ID,
    });
    expect(audit.events[0].metadata).toMatchObject({
      workspaceId: WORKSPACE_ID,
      label: 'meetup',
      maxUses: 5,
    });
    // Neither the raw code nor its hash may leak into the audit trail.
    const serialized = JSON.stringify(audit.events[0]);
    expect(serialized).not.toContain(result.code);
    expect(serialized).not.toContain('hash-1');
  });
});

describe('RotateJoinCodeUseCase', () => {
  it('records a JOIN_CODE_ROTATED audit event for the workspace', async () => {
    const workspace = workspaceRecord();
    const workspaceRepo = {
      async update(_id: string, patch: Record<string, unknown>) {
        expect(patch).toHaveProperty('joinCode');
        return { ...workspace, ...patch };
      },
    };
    const audit = makeAudit();
    const useCase = new RotateJoinCodeUseCase(
      workspaceRepo as never,
      membershipRepo as never,
      adminUserRepo as never,
      audit
    );

    await useCase.execute({
      actorUserId: USER_ID,
      tid: TENANT_ID,
      workspaceId: workspace.id,
    });

    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      actorId: USER_ID,
      actorType: 'ADMIN',
      action: 'JOIN_CODE_ROTATED',
      targetType: 'workspace',
      targetId: workspace.id,
      tenantId: TENANT_ID,
    });
  });
});
