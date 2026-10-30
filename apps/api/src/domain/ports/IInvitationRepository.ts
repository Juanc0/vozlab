import type { DbTransaction } from './Transaction.js';

/**
 * Port: invitations in the tenant DB (D3, D9).
 */
export interface Invitation {
  id: string;
  workspaceId: string;
  /**
   * Peppered hash of the invited address (DEC-4):
   * `HMAC-SHA-256(lower(trim(email)), EMAIL_PEPPER)`. The cleartext email is
   * never stored.
   */
  emailHash: string | null;
  role: string;
  tokenHash: string;
  expiresAt: Date;
  maxUses: number | null;
  usedCount: number;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  revokedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface IInvitationRepository {
  /** Find an invitation by its token hash. */
  findByTokenHash(tokenHash: string, tid: string): Promise<Invitation | null>;

  /**
   * Atomically mark a PENDING invitation as accepted and increment
   * `used_count`. Returns `false` when the invitation was no longer PENDING
   * (another login redeemed it first), so the caller never grants twice.
   */
  accept(id: string, tid: string, tx?: DbTransaction): Promise<boolean>;

  /** Revoke an invitation. */
  revoke(id: string, tid: string): Promise<void>;

  /** Mark all PENDING invitations past their expiry as EXPIRED. Returns count. */
  expirePending(tid: string, now: Date): Promise<number>;

  /** Create a new invitation. */
  create(
    input: {
      workspaceId: string;
      emailHash?: string | null;
      role: string;
      tokenHash: string;
      expiresAt: Date;
      maxUses?: number | null;
      createdBy?: string | null;
    },
    tid: string,
    tx?: DbTransaction
  ): Promise<Invitation>;
}