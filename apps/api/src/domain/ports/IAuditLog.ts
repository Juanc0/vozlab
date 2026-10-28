/**
 * v5: audit log port for atomized auth/onboarding operations.
 * Implementations live in infrastructure (e.g. Drizzle or router DB).
 */
export interface AuditEvent {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata?: Record<string, unknown>;
  requestId?: string;
  createdAt?: Date;
  /**
   * Internal tenant UUID. Required for tenant-scoped events: they are
   * persisted to that tenant's `auth.membership_events` (which needs a
   * `workspaceId` — from `metadata.workspaceId`, or from `targetId` when
   * `targetType` is `'workspace'`).
   */
  tenantId?: string;
  /**
   * Router-DB events (`global_identity_events`) are used for cross-tenant
   * identity actions (`targetType: 'global_identity'`) and require this id.
   */
  globalIdentityId?: string;
  /**
   * Who acted, for the append-only tables. Defaults to `'USER'` when an
   * `actorId` is present and `'SYSTEM'` otherwise.
   */
  actorType?: 'USER' | 'ADMIN' | 'SYSTEM';
}

export interface IAuditLog {
  record(event: AuditEvent): Promise<void>;
}