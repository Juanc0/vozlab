import { membershipEvents } from '@vozlab/database';
import { DomainError } from '../../../domain/errors/DomainError.js';
import { AuditEvent, IAuditLog } from '../../../domain/ports/IAuditLog.js';
import { IGlobalUserEventRepository } from '../../../domain/ports/IGlobalUserEventRepository.js';
import type { ConnectionPoolManager } from '../ConnectionPoolManager.js';

/** Keys of `metadata` that map to dedicated columns of `membership_events`. */
const MAPPED_KEYS = new Set([
  'workspaceId',
  'targetUserId',
  'userId',
  'invitationId',
  'beforeRole',
  'afterRole',
  'reason',
  'actorType',
]);

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Persistent audit log (P0-4, v6/TASK-07).
 *
 * Routes each event to the physical store that owns its subject:
 * - `targetType: 'global_identity'` (or events with only a
 *   `globalUserId`) → router DB `global_user_events` (cross-tenant).
 * - Everything else → that tenant's `auth.membership_events` (append-only).
 *
 * Tenant events require a `workspaceId`: taken from `metadata.workspaceId`
 * or, when `targetType` is `'workspace'`, from `targetId`. A misconfigured
 * event is an error — an audit gap must be visible, never silent.
 *
 * `metadata` keys without a dedicated column are preserved in `reason` as
 * JSON when no explicit `reason` is given.
 */
export class DrizzleAuditLog implements IAuditLog {
  constructor(
    private readonly poolManager: ConnectionPoolManager,
    private readonly globalEvents: IGlobalUserEventRepository
  ) {}

  async record(event: AuditEvent): Promise<void> {
    const actorType = event.actorType ?? (event.actorId ? 'USER' : 'SYSTEM');

    if (event.targetType === 'global_identity' || (!event.tenantId && event.globalUserId)) {
      if (!event.globalUserId) {
        throw new DomainError(
          'ERR_VALIDATION_FAILED',
          'audit: global event without globalUserId'
        );
      }
      await this.globalEvents.recordUserEvent({
        globalUserId: event.globalUserId,
        tenantId: event.tenantId ?? null,
        actorType,
        actorId: event.actorId,
        action: event.action,
        metadata: event.metadata,
        requestId: event.requestId ?? null,
      });
      return;
    }

    if (!event.tenantId) {
      throw new DomainError(
        'ERR_VALIDATION_FAILED',
        `audit: tenant event ${event.action} without tenantId`
      );
    }
    const metadata = event.metadata ?? {};
    const workspaceId =
      asString(metadata.workspaceId) ??
      (event.targetType === 'workspace' ? event.targetId : null);
    if (!workspaceId) {
      throw new DomainError(
        'ERR_VALIDATION_FAILED',
        `audit: tenant event ${event.action} without workspaceId`
      );
    }

    const explicitReason = asString(metadata.reason);
    const extra = Object.fromEntries(
      Object.entries(metadata).filter(([key]) => !MAPPED_KEYS.has(key))
    );
    const reason =
      explicitReason ??
      (Object.keys(extra).length > 0 ? JSON.stringify(extra) : null);

    const db = await this.poolManager.getDb(event.tenantId);
    await db.insert(membershipEvents).values({
      workspaceId,
      userId:
        asString(metadata.targetUserId) ??
        asString(metadata.userId) ??
        (event.targetType === 'user' ? event.targetId : null),
      invitationId: asString(metadata.invitationId),
      actorType,
      actorId: event.actorId,
      action: event.action,
      beforeRole: asString(metadata.beforeRole),
      afterRole: asString(metadata.afterRole),
      reason,
      requestId: event.requestId ?? null,
    });
  }
}

/**
 * In-memory audit log for unit tests and environments without a database.
 * NOT for production: it persists nothing (see DrizzleAuditLog).
 */
export class InMemoryAuditLog implements IAuditLog {
  private events: AuditEvent[] = [];
  async record(event: AuditEvent): Promise<void> {
    this.events.push({ ...event, createdAt: event.createdAt ?? new Date() });
  }
  snapshot(): AuditEvent[] {
    return [...this.events];
  }
}
