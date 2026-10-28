/**
 * Append-only sink for cross-tenant identity audit events
 * (`global_identity_events`, router DB). No PII: ids, roles and states only.
 */
export interface GlobalIdentityEventInput {
  globalIdentityId: string;
  tenantId: string | null;
  actorType: 'USER' | 'ADMIN' | 'SYSTEM';
  actorId: string | null;
  action: string;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
}

export interface IGlobalIdentityEventRepository {
  recordIdentityEvent(input: GlobalIdentityEventInput): Promise<void>;
}
