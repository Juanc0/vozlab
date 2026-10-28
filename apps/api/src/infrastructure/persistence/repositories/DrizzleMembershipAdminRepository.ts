import { and, eq, sql } from 'drizzle-orm';
import {
  membershipEvents,
  users,
  workspaceMemberships,
} from '@vozlab/database';
import type { WorkspaceRole } from '@vozlab/shared-types';
import {
  AdminMembershipRecord,
  IMembershipAdminRepository,
  MembershipAuditEventInput,
  UpsertMembershipInput,
} from '../../../domain/ports/IMembershipAdminRepository.js';
import { ConnectionPoolManager } from '../ConnectionPoolManager.js';
import { DbTransaction } from '../../../domain/ports/Transaction.js';

type Tx = Parameters<
  Parameters<Awaited<ReturnType<ConnectionPoolManager['getDb']>>['transaction']>[0]
>[0];

type MemberRow = {
  userId: string;
  email: string | null;
  fullName: string | null;
  role: string;
  status: string;
  createdAt: Date;
};

function toMember(row: MemberRow): AdminMembershipRecord {
  return {
    userId: row.userId,
    email: row.email,
    fullName: row.fullName,
    role: row.role as WorkspaceRole,
    status: row.status,
    joinedAt: row.createdAt,
  };
}

export class DrizzleMembershipAdminRepository
  implements IMembershipAdminRepository
{
  constructor(private readonly poolManager: ConnectionPoolManager) {}

  private async client(tid: string, tx?: DbTransaction) {
    return (tx as Tx | undefined) ?? (await this.poolManager.getDb(tid));
  }

  async find(
    userId: string,
    workspaceId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<AdminMembershipRecord | null> {
    const db = await this.client(tid, tx);
    const [row] = await db
      .select({
        userId: workspaceMemberships.userId,
        email: users.email,
        fullName: users.fullName,
        role: workspaceMemberships.role,
        status: workspaceMemberships.status,
        createdAt: workspaceMemberships.createdAt,
      })
      .from(workspaceMemberships)
      .innerJoin(users, eq(users.id, workspaceMemberships.userId))
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.userId, userId)
        )
      )
      .limit(1);
    return row ? toMember(row) : null;
  }

  async listByWorkspace(
    workspaceId: string,
    tid: string
  ): Promise<AdminMembershipRecord[]> {
    const db = await this.client(tid);
    const rows = await db
      .select({
        userId: workspaceMemberships.userId,
        email: users.email,
        fullName: users.fullName,
        role: workspaceMemberships.role,
        status: workspaceMemberships.status,
        createdAt: workspaceMemberships.createdAt,
      })
      .from(workspaceMemberships)
      .innerJoin(users, eq(users.id, workspaceMemberships.userId))
      .where(eq(workspaceMemberships.workspaceId, workspaceId))
      .orderBy(users.fullName, users.email);
    return rows.map(toMember);
  }

  async upsertMember(
    input: UpsertMembershipInput,
    tid: string,
    tx?: DbTransaction
  ): Promise<void> {
    const db = await this.client(tid, tx);
    await db
      .insert(workspaceMemberships)
      .values({
        userId: input.userId,
        workspaceId: input.workspaceId,
        role: input.role,
        status: 'ACTIVE',
      })
      .onConflictDoUpdate({
        target: [
          workspaceMemberships.workspaceId,
          workspaceMemberships.userId,
          workspaceMemberships.role,
        ],
        set: { status: 'ACTIVE' },
      });
  }

  async removeRole(
    userId: string,
    workspaceId: string,
    role: WorkspaceRole,
    tid: string,
    tx?: DbTransaction
  ): Promise<void> {
    const db = await this.client(tid, tx);
    await db
      .delete(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.userId, userId),
          eq(workspaceMemberships.role, role)
        )
      );
  }

  async countActiveAdmins(
    workspaceId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<number> {
    const db = await this.client(tid, tx);
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.role, 'ADMIN'),
          eq(workspaceMemberships.status, 'ACTIVE')
        )
      );
    return Number(row?.count ?? 0);
  }

  async recordEvent(
    input: MembershipAuditEventInput,
    tid: string,
    tx?: DbTransaction
  ): Promise<void> {
    const db = await this.client(tid, tx);
    await db.insert(membershipEvents).values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      invitationId: input.invitationId ?? null,
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      beforeRole: input.beforeRole ?? null,
      afterRole: input.afterRole ?? null,
      reason: input.reason ?? null,
      requestId: input.requestId ?? null,
    });
  }
}
