import { and, eq, isNull, sql } from 'drizzle-orm';
import { workspaceJoinCodes } from '@vozlab/database';
import { IWorkspaceJoinCodeRepository, WorkspaceJoinCodeRecord, CreateWorkspaceJoinCodeInput } from '../../../domain/ports/IWorkspaceJoinCodeRepository.js';
import { ConnectionPoolManager } from '../ConnectionPoolManager.js';
import { DbTransaction } from '../../../domain/ports/Transaction.js';
import { InfrastructureError } from '../../../domain/errors/InfrastructureError.js';

type Tx = Parameters<Parameters<Awaited<ReturnType<ConnectionPoolManager['getDb']>>['transaction']>[0]>[0];

export class DrizzleWorkspaceJoinCodeRepository implements IWorkspaceJoinCodeRepository {
  constructor(private readonly poolManager: ConnectionPoolManager) {}

  private async client(tid: string, tx?: DbTransaction) {
    return (tx as Tx | undefined) ?? (await this.poolManager.getDb(tid));
  }

  private toRecord(row: typeof workspaceJoinCodes.$inferSelect): WorkspaceJoinCodeRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      codeHash: row.codeHash,
      label: row.label,
      expiresAt: row.expiresAt,
      maxUses: row.maxUses,
      usedCount: row.usedCount,
      autoApprove: row.autoApprove,
      revokedAt: row.revokedAt,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    };
  }

  async create(input: CreateWorkspaceJoinCodeInput, tid: string, tx?: DbTransaction): Promise<WorkspaceJoinCodeRecord> {
    const db = await this.client(tid, tx);
    const [row] = await db
      .insert(workspaceJoinCodes)
      .values({
        workspaceId: input.workspaceId,
        codeHash: input.codeHash,
        label: input.label ?? null,
        expiresAt: input.expiresAt ?? null,
        maxUses: input.maxUses ?? null,
        autoApprove: input.autoApprove ?? false,
        createdBy: input.createdBy ?? null,
      })
      .returning();
    return this.toRecord(row);
  }

  async list(workspaceId: string, tid: string): Promise<WorkspaceJoinCodeRecord[]> {
    const db = await this.client(tid);
    const rows = await db
      .select()
      .from(workspaceJoinCodes)
      .where(eq(workspaceJoinCodes.workspaceId, workspaceId));
    return rows.map((r) => this.toRecord(r));
  }

  async findByCodeHash(codeHash: string, tid: string): Promise<WorkspaceJoinCodeRecord | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select()
      .from(workspaceJoinCodes)
      .where(eq(workspaceJoinCodes.codeHash, codeHash))
      .limit(1);
    return row ? this.toRecord(row) : null;
  }

  async revoke(id: string, tid: string, tx?: DbTransaction): Promise<void> {
    const db = await this.client(tid, tx);
    await db
      .update(workspaceJoinCodes)
      .set({ revokedAt: new Date() })
      .where(eq(workspaceJoinCodes.id, id));
  }

  async incrementUse(id: string, tid: string, tx?: DbTransaction): Promise<void> {
    const db = await this.client(tid, tx);
    await db
      .update(workspaceJoinCodes)
      .set({ usedCount: sql`${workspaceJoinCodes.usedCount} + 1` })
      .where(eq(workspaceJoinCodes.id, id));
  }
}