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

export interface IWorkspaceJoinCodeRepository {
  create(input: CreateWorkspaceJoinCodeInput, tid: string, tx?: DbTransaction): Promise<WorkspaceJoinCodeRecord>;
  list(workspaceId: string, tid: string): Promise<WorkspaceJoinCodeRecord[]>;
  findByCodeHash(codeHash: string, tid: string): Promise<WorkspaceJoinCodeRecord | null>;
  revoke(id: string, tid: string, tx?: DbTransaction): Promise<void>;
  incrementUse(id: string, tid: string, tx?: DbTransaction): Promise<void>;
}