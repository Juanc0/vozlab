/**
 * Append-only sink for cross-tenant identity audit events
 * (`global_user_events`, router DB). No PII: ids, roles and states only.
 */
export interface GlobalUserEventInput {
  globalUserId: string;
  tenantId: string | null;
  actorType: 'USER' | 'ADMIN' | 'SYSTEM';
  actorId: string | null;
  action: string;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
}

export interface IGlobalUserEventRepository {
  recordUserEvent(input: GlobalUserEventInput): Promise<void>;
}
