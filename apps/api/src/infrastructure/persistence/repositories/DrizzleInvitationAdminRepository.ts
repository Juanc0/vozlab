import { and, desc, eq, sql } from 'drizzle-orm';
import { invitations } from '@vozlab/database';
import { IInvitationAdminRepository } from '../../../domain/ports/IInvitationAdminRepository.js';
import { Invitation } from '../../../domain/ports/IInvitationRepository.js';
import { ConnectionPoolManager } from '../ConnectionPoolManager.js';
import { DbTransaction } from '../../../domain/ports/Transaction.js';

type Tx = Parameters<
  Parameters<Awaited<ReturnType<ConnectionPoolManager['getDb']>>['transaction']>[0]
>[0];

function toInvitation(row: typeof invitations.$inferSelect): Invitation {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    email: row.email,
    emailHash: row.emailHash,
    role: row.role,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    status: row.status as Invitation['status'],
    revokedAt: row.revokedAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

export class DrizzleInvitationAdminRepository
  implements IInvitationAdminRepository
{
  constructor(private readonly poolManager: ConnectionPoolManager) {}

  private async client(tid: string, tx?: DbTransaction) {
    return (tx as Tx | undefined) ?? (await this.poolManager.getDb(tid));
  }

  async findById(invitationId: string, tid: string): Promise<Invitation | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.id, invitationId))
      .limit(1);
    return row ? toInvitation(row) : null;
  }

  async listByWorkspace(
    workspaceId: string,
    tid: string
  ): Promise<Invitation[]> {
    const db = await this.client(tid);
    const rows = await db
      .select()
      .from(invitations)
      .where(eq(invitations.workspaceId, workspaceId))
      .orderBy(desc(invitations.createdAt))
      .limit(100);
    return rows.map(toInvitation);
  }

  async revokeById(
    invitationId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<boolean> {
    const db = await this.client(tid, tx);
    const rows = await db
      .update(invitations)
      .set({ status: 'REVOKED', revokedAt: new Date() })
      .where(
        and(eq(invitations.id, invitationId), eq(invitations.status, 'PENDING'))
      )
      .returning({ id: invitations.id });
    return rows.length > 0;
  }

  async revokePendingForEmail(
    workspaceId: string,
    email: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<number> {
    const db = await this.client(tid, tx);
    const rows = await db
      .update(invitations)
      .set({ status: 'REVOKED', revokedAt: new Date() })
      .where(
        and(
          eq(invitations.workspaceId, workspaceId),
          eq(invitations.status, 'PENDING'),
          sql`lower(${invitations.email}) = ${email.trim().toLowerCase()}`
        )
      )
      .returning({ id: invitations.id });
    return rows.length;
  }
}
