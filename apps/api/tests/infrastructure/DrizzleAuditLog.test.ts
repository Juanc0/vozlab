import { describe, expect, it } from 'vitest';
import { DrizzleAuditLog } from '../../src/infrastructure/persistence/repositories/DrizzleAuditLog.js';
import type { AuditEvent } from '../../src/domain/ports/IAuditLog.js';
import type { GlobalIdentityEventInput } from '../../src/domain/ports/IGlobalIdentityEventRepository.js';

interface Captured {
  tenantId: string | null;
  membershipValues: Record<string, unknown> | null;
  identityEvent: GlobalIdentityEventInput | null;
}

function makeFakes(): {
  state: Captured;
  poolManager: { getDb(tid: string): Promise<{ insert: (table: unknown) => { values: (v: Record<string, unknown>) => Promise<void> } }> };
  globalEvents: { recordIdentityEvent(input: GlobalIdentityEventInput): Promise<void> };
} {
  const state: Captured = { tenantId: null, membershipValues: null, identityEvent: null };
  const poolManager = {
    async getDb(tid: string) {
      state.tenantId = tid;
      return {
        insert(_table: unknown) {
          return {
            async values(v: Record<string, unknown>) {
              state.membershipValues = v;
            },
          };
        },
      };
    },
  };
  const globalEvents = {
    async recordIdentityEvent(input: GlobalIdentityEventInput) {
      state.identityEvent = input;
    },
  };
  return { state, poolManager, globalEvents };
}

const BASE: AuditEvent = {
  actorId: 'user-1',
  action: 'JOIN_REQUESTED',
  targetType: 'join_request',
  targetId: 'req-1',
  tenantId: 'tenant-1',
  metadata: { workspaceId: 'ws-1', userId: 'user-1' },
};

describe('DrizzleAuditLog', () => {
  it('routes tenant events to membership_events with mapped columns', async () => {
    const { state, poolManager, globalEvents } = makeFakes();
    const audit = new DrizzleAuditLog(poolManager as never, globalEvents);

    await audit.record({
      ...BASE,
      metadata: {
        workspaceId: 'ws-1',
        targetUserId: 'user-2',
        invitationId: 'inv-9',
        beforeRole: 'MEMBER',
        afterRole: 'MODERATOR',
        reason: 'promotion',
      },
      requestId: 'req-42',
    });

    expect(state.tenantId).toBe('tenant-1');
    expect(state.identityEvent).toBeNull();
    expect(state.membershipValues).toMatchObject({
      workspaceId: 'ws-1',
      userId: 'user-2',
      invitationId: 'inv-9',
      actorType: 'USER',
      actorId: 'user-1',
      action: 'JOIN_REQUESTED',
      beforeRole: 'MEMBER',
      afterRole: 'MODERATOR',
      reason: 'promotion',
      requestId: 'req-42',
    });
  });

  it('derives workspaceId from targetId for workspace-targeted events', async () => {
    const { state, poolManager, globalEvents } = makeFakes();
    const audit = new DrizzleAuditLog(poolManager as never, globalEvents);

    await audit.record({
      actorId: 'admin-1',
      action: 'JOIN_CODE_ROTATED',
      targetType: 'workspace',
      targetId: 'ws-7',
      tenantId: 'tenant-1',
    });

    expect(state.membershipValues).toMatchObject({
      workspaceId: 'ws-7',
      userId: null,
      reason: null,
      actorType: 'USER',
    });
  });

  it('perserves unmapped metadata as JSON in reason', async () => {
    const { state, poolManager, globalEvents } = makeFakes();
    const audit = new DrizzleAuditLog(poolManager as never, globalEvents);

    await audit.record({
      ...BASE,
      metadata: { workspaceId: 'ws-1', label: 'meetup', maxUses: 5 },
    });

    const reason = state.membershipValues?.reason as string;
    expect(JSON.parse(reason)).toEqual({ label: 'meetup', maxUses: 5 });
  });

  it('routes global_identity events to the router sink without touching a tenant DB', async () => {
    const { state, poolManager, globalEvents } = makeFakes();
    const audit = new DrizzleAuditLog(poolManager as never, globalEvents);

    await audit.record({
      actorId: 'global-1',
      action: 'GLOBAL_INVITATION_REDEEMED',
      targetType: 'global_identity',
      targetId: 'global-1',
      tenantId: 'tenant-9',
      globalIdentityId: 'global-1',
      metadata: { invitationId: 'gi-1' },
      actorType: 'USER',
    });

    expect(state.tenantId).toBeNull();
    expect(state.membershipValues).toBeNull();
    expect(state.identityEvent).toMatchObject({
      globalIdentityId: 'global-1',
      tenantId: 'tenant-9',
      actorType: 'USER',
      action: 'GLOBAL_INVITATION_REDEEMED',
      metadata: { invitationId: 'gi-1' },
    });
  });

  it('defaults actorType to SYSTEM when no actor', async () => {
    const { state, poolManager, globalEvents } = makeFakes();
    const audit = new DrizzleAuditLog(poolManager as never, globalEvents);

    await audit.record({
      ...BASE,
      actorId: null,
      metadata: { workspaceId: 'ws-1' },
    });

    expect(state.membershipValues).toMatchObject({ actorType: 'SYSTEM', actorId: null });
  });

  it('fails loudly on a tenant event without tenantId or workspaceId', async () => {
    const { poolManager, globalEvents } = makeFakes();
    const audit = new DrizzleAuditLog(poolManager as never, globalEvents);

    await expect(
      audit.record({
        actorId: 'user-1',
        action: 'X',
        targetType: 'join_request',
        targetId: 'r-1',
      })
    ).rejects.toMatchObject({ code: 'ERR_VALIDATION_FAILED' });

    await expect(
      audit.record({
        actorId: 'user-1',
        action: 'X',
        targetType: 'join_request',
        targetId: 'r-1',
        tenantId: 'tenant-1',
      })
    ).rejects.toMatchObject({ code: 'ERR_VALIDATION_FAILED' });
  });
});
