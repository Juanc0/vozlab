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
}

export interface IAuditLog {
  record(event: AuditEvent): Promise<void>;
}