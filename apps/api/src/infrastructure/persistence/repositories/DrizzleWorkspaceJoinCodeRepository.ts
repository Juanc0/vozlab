import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { workspaceJoinCodes } from '@vozlab/database';
import {
  IWorkspaceJoinCodeRepository,
  JoinCodePurpose,
  WorkspaceJoinCodeRecord,
  CreateWorkspaceJoinCodeInput,
  UpdateWorkspaceJoinCodeInput,
} from '../../../domain/ports/IWorkspaceJoinCodeRepository.js';
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
      purpose: row.purpose as WorkspaceJoinCodeRecord['purpose'],
      label: row.label,
      expiresAt: row.expiresAt,
      maxUses: row.maxUses,
      usedCount: row.usedCount,
      autoApprove: row.autoApprove,
      revokedAt: row.revokedAt,
      createdByHash: row.createdByHash,
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
        purpose: input.purpose ?? 'WORKSPACE',
        label: input.label ?? null,
        expiresAt: input.expiresAt ?? null,
        maxUses: input.maxUses ?? null,
        autoApprove: input.autoApprove ?? false,
        createdByHash: input.createdByHash ?? null,
      })
      .returning();
    return this.toRecord(row);
  }

  async list(
    workspaceId: string,
    tid: string,
    tx?: DbTransaction,
    purpose?: JoinCodePurpose
  ): Promise<WorkspaceJoinCodeRecord[]> {
    const db = await this.client(tid, tx);
    const rows = await db
      .select()
      .from(workspaceJoinCodes)
      .where(
        purpose
          ? and(
              eq(workspaceJoinCodes.workspaceId, workspaceId),
              eq(workspaceJoinCodes.purpose, purpose)
            )
          : eq(workspaceJoinCodes.workspaceId, workspaceId)
      );
    return rows.map((r) => this.toRecord(r));
  }

  async findById(id: string, tid: string): Promise<WorkspaceJoinCodeRecord | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select()
      .from(workspaceJoinCodes)
      .where(eq(workspaceJoinCodes.id, id))
      .limit(1);
    return row ? this.toRecord(row) : null;
  }

  /**
   * P4 (ADR-0045) + DEC-3/ADR-0046: one conditional UPDATE claims the use —
   * purpose, revocation, expiry and capacity are enforced by the database
   * itself, so concurrent redemptions can never overbook `max_uses` and a
   * code of the other credential class can never match. The EVENT class
   * additionally requires `auto_approve = true` in the statement (an EVENT
   * credential that does not auto-approve is a misconfiguration, and the
   * anonymous path has no approval flow to fall back to).
   */
  async consume(
    codeHash: string,
    purpose: JoinCodePurpose,
    tid: string,
    tx?: DbTransaction
  ): Promise<WorkspaceJoinCodeRecord | null> {
    const db = await this.client(tid, tx);
    const now = new Date();
    const [row] = await db
      .update(workspaceJoinCodes)
      .set({ usedCount: sql`${workspaceJoinCodes.usedCount} + 1` })
      .where(
        and(
          eq(workspaceJoinCodes.codeHash, codeHash),
          eq(workspaceJoinCodes.purpose, purpose),
          ...(purpose === 'EVENT'
            ? [eq(workspaceJoinCodes.autoApprove, true)]
            : []),
          isNull(workspaceJoinCodes.revokedAt),
          or(
            isNull(workspaceJoinCodes.expiresAt),
            gt(workspaceJoinCodes.expiresAt, now)
          ),
          or(
            isNull(workspaceJoinCodes.maxUses),
            sql`${workspaceJoinCodes.usedCount} < ${workspaceJoinCodes.maxUses}`
          )
        )
      )
      .returning();
    return row ? this.toRecord(row) : null;
  }

  async update(
    id: string,
    patch: UpdateWorkspaceJoinCodeInput,
    tid: string,
    tx?: DbTransaction
  ): Promise<WorkspaceJoinCodeRecord | null> {
    const db = await this.client(tid, tx);
    const values: Record<string, unknown> = {};
    if (patch.label !== undefined) values.label = patch.label;
    if (patch.expiresAt !== undefined) values.expiresAt = patch.expiresAt;
    if (patch.maxUses !== undefined) values.maxUses = patch.maxUses;
    if (patch.autoApprove !== undefined) values.autoApprove = patch.autoApprove;
    if (Object.keys(values).length === 0) return this.findById(id, tid);
    const [row] = await db
      .update(workspaceJoinCodes)
      .set(values)
      .where(eq(workspaceJoinCodes.id, id))
      .returning();
    return row ? this.toRecord(row) : null;
  }

  async revoke(id: string, tid: string, tx?: DbTransaction): Promise<void> {
    const db = await this.client(tid, tx);
    await db
      .update(workspaceJoinCodes)
      .set({ revokedAt: new Date() })
      .where(eq(workspaceJoinCodes.id, id));
  }
}