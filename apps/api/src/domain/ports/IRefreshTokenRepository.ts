import type { DbTransaction } from './Transaction.js';

export interface CreateRefreshTokenInput {
  userId: string;
  /** Rotating family; a new login starts a new family. */
  familyId: string;
  /** SHA-256 hex of the raw token. The raw value is never stored. */
  tokenHash: string;
  expiresAt: Date;
}

export interface RotateRefreshTokenInput {
  oldTokenHash: string;
  newTokenHash: string;
  newExpiresAt: Date;
}

export type RotateRefreshTokenResult =
  | { status: 'OK'; userId: string; familyId: string }
  /**
   * A token that was already rotated was presented again. The repository
   * revokes the entire family inside the same transaction; the caller only
   * needs to reject the request.
   */
  | { status: 'REUSED'; familyId: string }
  | { status: 'INVALID' };

/**
 * Port: rotating refresh sessions (`auth.refresh_tokens`, ADR-0018).
 *
 * Every operation is scoped by `tid`; implementations must make rotation
 * atomic (a single transaction with an atomic UPDATE) so two concurrent
 * refreshes cannot mint two live tokens from the same credential.
 */
export interface IRefreshTokenRepository {
  create(
    input: CreateRefreshTokenInput,
    tid: string,
    tx?: DbTransaction
  ): Promise<void>;
  rotate(
    input: RotateRefreshTokenInput,
    tid: string
  ): Promise<RotateRefreshTokenResult>;
  /** Logout: revoke the family that the presented token belongs to. */
  revokeFamilyByHash(tokenHash: string, tid: string): Promise<void>;
  /** Reuse detection: revoke every live token in a family. */
  revokeFamily(familyId: string, tid: string): Promise<void>;
}
