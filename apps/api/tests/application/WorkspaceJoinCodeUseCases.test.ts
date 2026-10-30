import { describe, expect, it } from 'vitest';
import { CreateWorkspaceJoinCodeUseCase } from '../../src/application/use_cases/CreateWorkspaceJoinCodeUseCase.js';
import { UpdateWorkspaceJoinCodeUseCase } from '../../src/application/use_cases/UpdateWorkspaceJoinCodeUseCase.js';
import { RotateJoinCodeUseCase } from '../../src/application/use_cases/RotateJoinCodeUseCase.js';
import type { AuditEvent } from '../../src/domain/ports/IAuditLog.js';
import type {
  UpdateWorkspaceJoinCodeInput,
  WorkspaceJoinCodeRecord,
} from '../../src/domain/ports/IWorkspaceJoinCodeRepository.js';
import { AUTH_USER, TENANT_ID, USER_ID, WORKSPACE_ID } from '../support/authFakes.js';
import { TX_SENTINEL, makeUnitOfWork } from '../support/fakes.js';

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

function codeRecord(
  overrides: Partial<WorkspaceJoinCodeRecord> = {}
): WorkspaceJoinCodeRecord {
  return {
    id: 'code-1',
    workspaceId: WORKSPACE_ID,
    codeHash: 'hash-1',
    purpose: 'WORKSPACE',
    label: 'meetup',
    expiresAt: new Date('2030-01-01'),
    maxUses: 5,
    usedCount: 0,
    autoApprove: false,
    revokedAt: null,
    createdByHash: USER_ID,
    createdAt: new Date(),
    ...overrides,
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
      actorAuthorHash: AUTH_USER.authorHash,
      tid: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      label: 'meetup',
      maxUses: 5,
      expiresAt: new Date('2030-01-01'),
    });

    expect(created).toHaveLength(1);
    // ADR-0045 / P8.4: the creator is recorded as the pseudonym, never the
    // user id.
    expect(created[0].createdByHash).toBe(AUTH_USER.authorHash);
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

describe('UpdateWorkspaceJoinCodeUseCase (v6/TASK-04, B6)', () => {
  /** In-memory repo: findById answers `existing`, update merges the patch. */
  function makeCodeRepo(existing: WorkspaceJoinCodeRecord | null) {
    const patches: Array<{ id: string; patch: UpdateWorkspaceJoinCodeInput }> = [];
    return {
      repo: {
        async findById() {
          return existing;
        },
        async update(id: string, patch: UpdateWorkspaceJoinCodeInput) {
          patches.push({ id, patch });
          if (!existing) return null;
          return { ...existing, ...patch } as WorkspaceJoinCodeRecord;
        },
      },
      patches,
    };
  }

  function useCaseWith(existing: WorkspaceJoinCodeRecord | null) {
    const { repo, patches } = makeCodeRepo(existing);
    const audit = makeAudit();
    return {
      patches,
      audit,
      useCase: new UpdateWorkspaceJoinCodeUseCase(
        repo as never,
        adminUserRepo as never,
        membershipRepo as never,
        audit
      ),
    };
  }

  it('patches the mutable attributes and records JOIN_CODE_UPDATED', async () => {
    const { useCase, audit, patches } = useCaseWith(codeRecord());

    const updated = await useCase.execute({
      actorUserId: USER_ID,
      tid: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      codeId: 'code-1',
      patch: { label: 'meetup-2', autoApprove: true },
    });

    expect(patches).toHaveLength(1);
    expect(patches[0].patch).toEqual({ label: 'meetup-2', autoApprove: true });
    expect(updated.label).toBe('meetup-2');
    expect(updated.autoApprove).toBe(true);
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      actorId: USER_ID,
      actorType: 'ADMIN',
      action: 'JOIN_CODE_UPDATED',
      targetType: 'join_code',
      targetId: 'code-1',
      tenantId: TENANT_ID,
    });
    // The hash is never part of the patch or the audit payload.
    expect(JSON.stringify([patches, audit.events])).not.toContain('hash-1');
  });

  it('rejects a code of another workspace with NOT_FOUND (no ownership leak)', async () => {
    const foreign = { ...codeRecord(), workspaceId: 'other-workspace' };
    const { useCase, patches } = useCaseWith(foreign);

    await expect(
      useCase.execute({
        actorUserId: USER_ID,
        tid: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        codeId: 'code-1',
        patch: { label: 'x' },
      })
    ).rejects.toMatchObject({ code: 'ERR_JOIN_CODE_NOT_FOUND' });
    expect(patches).toHaveLength(0);
  });

  it('refuses to patch a revoked code (the withdrawn secret stays withdrawn)', async () => {
    const revoked = { ...codeRecord(), revokedAt: new Date() };
    const { useCase, patches } = useCaseWith(revoked);

    await expect(
      useCase.execute({
        actorUserId: USER_ID,
        tid: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        codeId: 'code-1',
        patch: { autoApprove: true },
      })
    ).rejects.toMatchObject({ code: 'ERR_VALIDATION_FAILED' });
    expect(patches).toHaveLength(0);
  });

  it('refuses a cap below the uses already consumed', async () => {
    const used = { ...codeRecord(), usedCount: 3 };
    const { useCase, patches } = useCaseWith(used);

    await expect(
      useCase.execute({
        actorUserId: USER_ID,
        tid: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        codeId: 'code-1',
        patch: { maxUses: 2 },
      })
    ).rejects.toMatchObject({ code: 'ERR_VALIDATION_FAILED' });
    expect(patches).toHaveLength(0);

    // The cap equal to what was consumed is legal (the code simply closes).
    const ok = await useCase.execute({
      actorUserId: USER_ID,
      tid: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      codeId: 'code-1',
      patch: { maxUses: 3 },
    });
    expect(ok.maxUses).toBe(3);
  });

  it('clearing the expiry (null) is a legal patch', async () => {
    const { useCase, patches } = useCaseWith(codeRecord());
    await useCase.execute({
      actorUserId: USER_ID,
      tid: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      codeId: 'code-1',
      patch: { expiresAt: null },
    });
    expect(patches[0].patch.expiresAt).toBeNull();
  });
});

describe('RotateJoinCodeUseCase', () => {
  /** Fake join-code table: list/revoke/create with call recording. */
  function makeRotateRepo(initial: WorkspaceJoinCodeRecord[]) {
    const rows = new Map(initial.map((r) => [r.id, r]));
    const revokes: string[] = [];
    const listCalls: Array<{ workspaceId: string; tx?: unknown }> = [];
    const creates: Array<{
      workspaceId: string;
      codeHash: string;
      purpose?: string;
      label: string | null;
      autoApprove: boolean | undefined;
      maxUses: number | null | undefined;
      expiresAt: Date | null | undefined;
      createdByHash: string | null | undefined;
    }> = [];
    let seq = rows.size;
    return {
      repo: {
        async list(workspaceId: string, _tid: string, tx?: unknown) {
          listCalls.push({ workspaceId, tx });
          return [...rows.values()].filter((r) => r.workspaceId === workspaceId);
        },
        async revoke(id: string) {
          revokes.push(id);
          const row = rows.get(id);
          if (row) row.revokedAt = new Date();
        },
        async create(input: (typeof creates)[number]) {
          creates.push(input);
          const row: WorkspaceJoinCodeRecord = {
            ...codeRecord(),
            purpose:
              (input.purpose as WorkspaceJoinCodeRecord['purpose']) ?? 'WORKSPACE',
            id: `code-${++seq}`,
            workspaceId: input.workspaceId,
            codeHash: input.codeHash,
            label: input.label,
            autoApprove: input.autoApprove ?? false,
            maxUses: input.maxUses ?? null,
            expiresAt: input.expiresAt ?? null,
            revokedAt: null,
            usedCount: 0,
            createdByHash: input.createdByHash ?? null,
            createdAt: new Date(),
          };
          rows.set(row.id, row);
          return row;
        },
      } as never,
      rows,
      revokes,
      listCalls,
      creates,
    };
  }

  const { uow } = makeUnitOfWork();

  it('revokes the most recent live row and inserts the new code in one transaction', async () => {
    const old = codeRecord({ id: 'code-old', createdAt: new Date('2026-01-01') });
    const newest = {
      ...codeRecord({
        id: 'code-newest',
        createdAt: new Date('2026-06-01'),
        label: 'summer round',
        autoApprove: true,
        maxUses: 10,
      }),
    };
    const revokedOld = { ...codeRecord({ id: 'code-dead', revokedAt: new Date('2026-02-01') }) };
    const fake = makeRotateRepo([old, newest, revokedOld]);
    const audit = makeAudit();
    const useCase = new RotateJoinCodeUseCase(
      fake.repo,
      membershipRepo as never,
      adminUserRepo as never,
      uow,
      audit
    );

    const result = await useCase.execute({
      actorUserId: USER_ID,
      actorAuthorHash: AUTH_USER.authorHash,
      tid: TENANT_ID,
      workspaceId: WORKSPACE_ID,
    });

    // T4-M2: the current-row read happened INSIDE the transaction.
    expect(fake.listCalls).toHaveLength(1);
    expect(fake.listCalls[0]).toMatchObject({
      workspaceId: WORKSPACE_ID,
      tx: TX_SENTINEL,
    });

    // Only the most recent NON-revoked row dies; already-revoked history
    // is left alone.
    expect(fake.revokes).toEqual(['code-newest']);
    expect(fake.rows.get('code-old')?.revokedAt).toBeNull();
    expect(fake.rows.get('code-dead')?.revokedAt).not.toBeNull();

    // The new row inherits the live policy of the code it replaces and is
    // attributed to the actor's pseudonym.
    expect(fake.creates).toHaveLength(1);
    expect(fake.creates[0]).toMatchObject({
      workspaceId: WORKSPACE_ID,
      purpose: 'WORKSPACE',
      label: 'summer round',
      autoApprove: true,
      maxUses: 10,
      createdByHash: AUTH_USER.authorHash,
    });
    // The raw code appears only in the answer; only the hash reached the row.
    expect(result.code).toMatch(/^[0-9A-F]{24}$/);
    expect(fake.creates[0].codeHash ?? '').not.toBe(result.code);

    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      actorId: USER_ID,
      actorType: 'ADMIN',
      action: 'JOIN_CODE_ROTATED',
      targetType: 'join_code',
      targetId: result.id,
      tenantId: TENANT_ID,
      metadata: { workspaceId: WORKSPACE_ID },
    });
  });

  it('rotation never touches a live EVENT row of the same workspace (DEC-3)', async () => {
    // The event QR credential is a different class: rotating the workspace
    // code must not revoke the EVENT row nor inherit its attributes.
    const eventRow = codeRecord({
      id: 'code-event',
      purpose: 'EVENT',
      autoApprove: true,
      createdAt: new Date('2026-06-01'),
    });
    const workspaceRow = codeRecord({
      id: 'code-ws',
      createdAt: new Date('2026-01-01'),
    });
    const fake = makeRotateRepo([eventRow, workspaceRow]);
    const useCase = new RotateJoinCodeUseCase(
      fake.repo,
      membershipRepo as never,
      adminUserRepo as never,
      uow
    );

    await useCase.execute({
      actorUserId: USER_ID,
      actorAuthorHash: AUTH_USER.authorHash,
      tid: TENANT_ID,
      workspaceId: WORKSPACE_ID,
    });

    // Only the WORKSPACE row dies; the EVENT row survives untouched.
    expect(fake.revokes).toEqual(['code-ws']);
    expect(fake.rows.get('code-event')?.revokedAt).toBeNull();
  });

  it('a legacy workspace without a live row simply gets one', async () => {
    const fake = makeRotateRepo([]);
    const useCase = new RotateJoinCodeUseCase(
      fake.repo,
      membershipRepo as never,
      adminUserRepo as never,
      uow
    );

    const result = await useCase.execute({
      actorUserId: USER_ID,
      actorAuthorHash: AUTH_USER.authorHash,
      tid: TENANT_ID,
      workspaceId: WORKSPACE_ID,
    });

    expect(fake.revokes).toHaveLength(0);
    expect(fake.creates).toHaveLength(1);
    expect(fake.creates[0]).toMatchObject({ label: 'default', autoApprove: false });
    expect(result.code).toMatch(/^[0-9A-F]{24}$/);
  });
});
