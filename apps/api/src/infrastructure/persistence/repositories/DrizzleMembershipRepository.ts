import { and, eq } from 'drizzle-orm';
import { workspaceMemberships } from '@vozlab/database';
import {
  IMembershipRepository,
  WorkspaceRole,
} from '../../../domain/ports/IMembershipRepository.js';
import { ConnectionPoolManager } from '../ConnectionPoolManager.js';
import { DbTransaction } from '../../../domain/ports/Transaction.js';

/** Concrete Drizzle transaction type resolved from the tenant pool client. */
type Tx = Parameters<
  Parameters<Awaited<ReturnType<ConnectionPoolManager['getDb']>>['transaction']>[0]
>[0];

/**
 * DrizzleMembershipRepository: reads `auth.workspace_memberships` inside the
 * tenant's physical database to resolve workspace membership (FR-05).
 *
 * Every operation is scoped by `tid`; when a `tx` (transaction) handle is
 * provided it is reused so reads participate in the caller's boundary.
 */
export class DrizzleMembershipRepository implements IMembershipRepository {
  constructor(private readonly poolManager: ConnectionPoolManager) {}

  /** Resolve the Drizzle client: the open transaction, or the tenant pool. */
  private async client(tid: string, tx?: DbTransaction) {
    return (tx as Tx | undefined) ?? (await this.poolManager.getDb(tid));
  }

  async isMember(userId: string, workspaceId: string, tid: string): Promise<boolean> {
    const role = await this.getRole(userId, workspaceId, tid);
    return role !== null;
  }

  async getRole(
    userId: string,
    workspaceId: string,
    tid: string
  ): Promise<WorkspaceRole | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select({ role: workspaceMemberships.role })
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.userId, userId),
          eq(workspaceMemberships.status, 'ACTIVE')
        )
      )
      .limit(1);

    return row ? (row.role as WorkspaceRole) : null;
  }

  async add(
    userId: string,
    workspaceId: string,
    role: WorkspaceRole,
    tid: string,
    tx?: DbTransaction
  ): Promise<void> {
    const db = await this.client(tid, tx);
    await db
      .insert(workspaceMemberships)
      .values({ userId, workspaceId, role, status: 'ACTIVE' })
      .onConflictDoNothing();
  }

  async changeRole(
    userId: string,
    workspaceId: string,
    newRole: WorkspaceRole,
    tid: string,
    tx?: DbTransaction
  ): Promise<void> {
    const db = await this.client(tid, tx);
    await db
      .update(workspaceMemberships)
      .set({ role: newRole })
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.userId, userId)
        )
      );
  }

  async suspend(
    userId: string,
    workspaceId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<void> {
    const db = await this.client(tid, tx);
    await db
      .update(workspaceMemberships)
      .set({ status: 'SUSPENDED' })
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.userId, userId)
        )
      );
  }

  async reactivate(
    userId: string,
    workspaceId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<void> {
    const db = await this.client(tid, tx);
    await db
      .update(workspaceMemberships)
      .set({ status: 'ACTIVE' })
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.userId, userId)
        )
      );
  }

  async remove(
    userId: string,
    workspaceId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<void> {
    const db = await this.client(tid, tx);
    await db
      .update(workspaceMemberships)
      .set({ status: 'REMOVED' })
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.userId, userId)
        )
      );
  }
}
