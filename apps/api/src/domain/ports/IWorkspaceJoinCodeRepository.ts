import type { DbTransaction } from './Transaction.js';

/**
 * Credential class (DEC-3, ADR-0046). The two redemption paths each guard
 * their own purpose inside the atomic `consume`, so unifying the table does
 * not let an EVENT QR code grant an authenticated membership or a workspace
 * code drive the anonymous join.
 */
export type JoinCodePurpose = 'WORKSPACE' | 'EVENT';

export interface WorkspaceJoinCodeRecord {
  id: string;
  workspaceId: string;
  codeHash: string;
  purpose: JoinCodePurpose;
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
  /** Credential class. Omitted means 'WORKSPACE' (the admin default). */
  purpose?: JoinCodePurpose;
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
  list(
    workspaceId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<WorkspaceJoinCodeRecord[]>;
  findById(id: string, tid: string): Promise<WorkspaceJoinCodeRecord | null>;

  /**
   * Atomically consume one use of a code of the given purpose (P4,
   * ADR-0045/0046). The conditional `UPDATE … RETURNING` enforces purpose,
   * revocation, expiry and capacity in a single statement — concurrent
   * redemptions can never overbook `max_uses`, and a code of the other
   * class can never match. For the EVENT class the statement additionally
   * requires `auto_approve = true` (DEC-3: an EVENT credential is exactly
   * an auto-approving one; a misconfigured row must not redeem). Returns
   * the consumed row, or `null` when no live row matched (unknown, wrong
   * purpose, revoked, expired or exhausted).
   */
  consume(
    codeHash: string,
    purpose: JoinCodePurpose,
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
