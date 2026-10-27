import { and, eq, sql } from 'drizzle-orm';
import { invitations, workspaceMemberships } from '@vozlab/database';
import { IInvitationRepository, Invitation } from '../../../domain/ports/IInvitationRepository.js';
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

export class DrizzleInvitationRepository implements IInvitationRepository {
  constructor(private readonly poolManager: ConnectionPoolManager) {}

  private async client(tid: string, tx?: DbTransaction) {
    return (tx as Tx | undefined) ?? (await this.poolManager.getDb(tid));
  }

  async findByTokenHash(tokenHash: string, tid: string): Promise<Invitation | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, tokenHash))
      .limit(1);
    return row ? toInvitation(row) : null;
  }

  async accept(id: string, tid: string): Promise<void> {
    const db = await this.client(tid);
    await db
      .update(invitations)
      .set({
        status: 'ACCEPTED',
        usedCount: sql`${invitations.usedCount} + 1`,
      })
      .where(eq(invitations.id, id));
  }

  async revoke(id: string, tid: string): Promise<void> {
    const db = await this.client(tid);
    await db
      .update(invitations)
      .set({ status: 'REVOKED', revokedAt: new Date() })
      .where(eq(invitations.id, id));
  }

  async create(
    input: {
      workspaceId: string;
      email?: string | null;
      emailHash?: string | null;
      role: string;
      tokenHash: string;
      expiresAt: Date;
      maxUses?: number | null;
      createdBy?: string | null;
    },
    tid: string
  ): Promise<Invitation> {
    const db = await this.client(tid);
    const [row] = await db
      .insert(invitations)
      .values({
        workspaceId: input.workspaceId,
        email: input.email ?? null,
        emailHash: input.emailHash ?? null,
        role: input.role,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        maxUses: input.maxUses ?? null,
        createdBy: input.createdBy ?? null,
      })
      .returning();
    return toInvitation(row);
  }
}