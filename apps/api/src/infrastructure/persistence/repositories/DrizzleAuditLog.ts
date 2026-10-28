import { IAuditLog, AuditEvent } from '../../../domain/ports/IAuditLog.js';

/**
 * Minimal in-memory audit log adapter (P1). Production should persist to
 * membership_events or a dedicated audit table. This keeps the port usable.
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