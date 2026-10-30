import { and, desc, eq } from 'drizzle-orm';
import {
  users,
  workspaceJoinRequests,
  workspaces,
} from '@vozlab/database';
import {
  CreateJoinRequestInput,
  IJoinRequestRepository,
  JoinRequestRecord,
  JoinRequestStatus,
  JoinRequestWithUser,
  JoinRequestWithWorkspace,
} from '../../../domain/ports/IJoinRequestRepository.js';
import { ConnectionPoolManager } from '../ConnectionPoolManager.js';
import { DbTransaction } from '../../../domain/ports/Transaction.js';

type Tx = Parameters<
  Parameters<Awaited<ReturnType<ConnectionPoolManager['getDb']>>['transaction']>[0]
>[0];

type JoinRequestRow = typeof workspaceJoinRequests.$inferSelect;

function toRecord(row: JoinRequestRow): JoinRequestRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    status: row.status as JoinRequestStatus,
    message: row.message,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
  };
}

export class DrizzleJoinRequestRepository implements IJoinRequestRepository {
  constructor(private readonly poolManager: ConnectionPoolManager) {}

  private async client(tid: string, tx?: DbTransaction) {
    return (tx as Tx | undefined) ?? (await this.poolManager.getDb(tid));
  }

  async create(
    input: CreateJoinRequestInput,
    tid: string,
    tx?: DbTransaction
  ): Promise<JoinRequestRecord> {
    const db = await this.client(tid, tx);
    const [row] = await db
      .insert(workspaceJoinRequests)
      .values({
        workspaceId: input.workspaceId,
        userId: input.userId,
        message: input.message,
      })
      .onConflictDoNothing()
      .returning();

    if (row) return toRecord(row);

    // The partial unique index already has a PENDING request: this call is
    // idempotent, so a double click returns the request that exists.
    const existing = await this.findPending(input.workspaceId, input.userId, tid);
    if (existing) return existing;
    throw new Error('join request conflict without a pending request');
  }

  async findPending(
    workspaceId: string,
    userId: string,
    tid: string
  ): Promise<JoinRequestRecord | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select()
      .from(workspaceJoinRequests)
      .where(
        and(
          eq(workspaceJoinRequests.workspaceId, workspaceId),
          eq(workspaceJoinRequests.userId, userId),
          eq(workspaceJoinRequests.status, 'PENDING')
        )
      )
      .limit(1);
    return row ? toRecord(row) : null;
  }

  async findById(
    requestId: string,
    workspaceId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<JoinRequestRecord | null> {
    const db = await this.client(tid, tx);
    const [row] = await db
      .select()
      .from(workspaceJoinRequests)
      .where(
        and(
          eq(workspaceJoinRequests.id, requestId),
          eq(workspaceJoinRequests.workspaceId, workspaceId)
        )
      )
      .limit(1);
    return row ? toRecord(row) : null;
  }

  async listByWorkspace(
    workspaceId: string,
    status: JoinRequestStatus,
    tid: string,
    limit: number
  ): Promise<JoinRequestWithUser[]> {
    const db = await this.client(tid);
    const rows = await db
      .select({
        request: workspaceJoinRequests,
        handle: users.handle,
        fullName: users.fullName,
      })
      .from(workspaceJoinRequests)
      .innerJoin(users, eq(users.id, workspaceJoinRequests.userId))
      .where(
        and(
          eq(workspaceJoinRequests.workspaceId, workspaceId),
          eq(workspaceJoinRequests.status, status)
        )
      )
      .orderBy(desc(workspaceJoinRequests.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      ...toRecord(row.request),
      handle: row.handle,
      fullName: row.fullName,
    }));
  }

  async listByUser(
    userId: string,
    tid: string
  ): Promise<JoinRequestWithWorkspace[]> {
    const db = await this.client(tid);
    const rows = await db
      .select({
        request: workspaceJoinRequests,
        workspaceName: workspaces.name,
      })
      .from(workspaceJoinRequests)
      .innerJoin(workspaces, eq(workspaces.id, workspaceJoinRequests.workspaceId))
      .where(eq(workspaceJoinRequests.userId, userId))
      .orderBy(desc(workspaceJoinRequests.createdAt));

    return rows.map((row) => ({
      ...toRecord(row.request),
      workspaceName: row.workspaceName,
    }));
  }

  async decide(
    requestId: string,
    status: Exclude<JoinRequestStatus, 'PENDING'>,
    decidedBy: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<JoinRequestRecord | null> {
    const db = await this.client(tid, tx);
    const [row] = await db
      .update(workspaceJoinRequests)
      .set({ status, decidedBy, decidedAt: new Date() })
      .where(
        and(
          eq(workspaceJoinRequests.id, requestId),
          eq(workspaceJoinRequests.status, 'PENDING')
        )
      )
      .returning();
    return row ? toRecord(row) : null;
  }
}
