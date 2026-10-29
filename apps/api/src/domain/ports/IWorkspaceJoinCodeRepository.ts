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
  createdBy: string | null;
  createdAt: Date;
}

export interface CreateWorkspaceJoinCodeInput {
  workspaceId: string;
  codeHash: string;
  label?: string | null;
  expiresAt?: Date | null;
  maxUses?: number | null;
  autoApprove?: boolean;
  createdBy?: string | null;
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
  create(input: CreateWorkspaceJoinCodeInput, tid: string, tx?: DbTransaction): Promise<WorkspaceJoinCodeRecord>;
  list(workspaceId: string, tid: string): Promise<WorkspaceJoinCodeRecord[]>;
  findById(id: string, tid: string): Promise<WorkspaceJoinCodeRecord | null>;
  findByCodeHash(codeHash: string, tid: string): Promise<WorkspaceJoinCodeRecord | null>;
  update(
    id: string,
    patch: UpdateWorkspaceJoinCodeInput,
    tid: string,
    tx?: DbTransaction
  ): Promise<WorkspaceJoinCodeRecord | null>;
  revoke(id: string, tid: string, tx?: DbTransaction): Promise<void>;
  incrementUse(id: string, tid: string, tx?: DbTransaction): Promise<void>;
}