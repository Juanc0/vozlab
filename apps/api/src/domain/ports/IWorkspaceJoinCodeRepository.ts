import type { DbTransaction } from './Transaction.js';

export interface WorkspaceJoinCodeRecord {
  id: string;
  workspaceId: string;
  codeHash: string;
  label: string | null;
  expiresAt: Date | null;
  maxUses: number | null;
  usedCount: number;
  autoApprove: boolean;
  revokedAt: Date | null;
  /** ADR-0013 pseudonym of the creator (never a user id — DEC-5 D3). */
  createdByHash: string | null;
  createdAt: Date;
}

export interface CreateWorkspaceJoinCodeInput {
  workspaceId: string;
  codeHash: string;
  label?: string | null;
  expiresAt?: Date | null;
  maxUses?: number | null;
  autoApprove?: boolean;
  createdByHash?: string | null;
}

/**
 * Patch of the mutable attributes of a join code (v6/TASK-04, B6). The
 * `codeHash` is never patched — the secret stays the secret; rotating it is
 * a revoke + create, not an update.
 */
export interface UpdateWorkspaceJoinCodeInput {
  label?: string | null;
  expiresAt?: Date | null;
  maxUses?: number | null;
  autoApprove?: boolean;
}

export interface IWorkspaceJoinCodeRepository {
  create(
    input: CreateWorkspaceJoinCodeInput,
    tid: string,
    tx?: DbTransaction
  ): Promise<WorkspaceJoinCodeRecord>;
  list(workspaceId: string, tid: string): Promise<WorkspaceJoinCodeRecord[]>;
  findById(id: string, tid: string): Promise<WorkspaceJoinCodeRecord | null>;

  /**
   * Atomically consume one use of a code (P4, ADR-0045). The conditional
   * `UPDATE … RETURNING` enforces revocation, expiry and capacity in a
   * single statement — concurrent redemptions can never overbook
   * `max_uses`. Returns the consumed row, or `null` when no live row
   * matched (unknown, revoked, expired or exhausted).
   */
  consume(
    codeHash: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<WorkspaceJoinCodeRecord | null>;

  update(
    id: string,
    patch: UpdateWorkspaceJoinCodeInput,
    tid: string,
    tx?: DbTransaction
  ): Promise<WorkspaceJoinCodeRecord | null>;
  revoke(id: string, tid: string, tx?: DbTransaction): Promise<void>;
}
