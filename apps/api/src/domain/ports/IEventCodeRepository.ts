export interface ConsumedEventCode {
  codeId: string;
  tenantId: string;
  workspaceId: string;
  label: string | null;
}

export type ConsumeEventCodeResult =
  | { status: 'OK'; code: ConsumedEventCode }
  | { status: 'NOT_FOUND' }
  | { status: 'EXPIRED' }
  | { status: 'REVOKED' }
  | { status: 'FULL' };

export interface CreateEventCodeInput {
  tenantId: string;
  workspaceId: string;
  /** SHA-256 hex of the raw code printed to the organizer. */
  codeHash: string;
  label?: string;
  expiresAt: Date;
  maxUses?: number;
  createdByHash?: string;
}

/**
 * Port: global event-code registry (router DB, ADR-0019).
 *
 * Consumption is an atomic conditional UPDATE so capacity and expiry cannot be
 * bypassed by concurrent joins.
 */
export interface IEventCodeRepository {
  consume(codeHash: string): Promise<ConsumeEventCodeResult>;
  create(input: CreateEventCodeInput): Promise<{ id: string }>;
}
