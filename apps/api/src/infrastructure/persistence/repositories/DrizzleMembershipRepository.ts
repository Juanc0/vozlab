import { and, eq } from 'drizzle-orm';
import { workspaceMemberships } from '@vozlab/database';
import {
  IMembershipRepository,
  WorkspaceRole,
} from '../../../domain/ports/IMembershipRepository.js';
import { ConnectionPoolManager } from '../ConnectionPoolManager.js';

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
  private async client(tid: string, tx?: any) {
    return tx ?? (await this.poolManager.getDb(tid));
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
          eq(workspaceMemberships.userId, userId)
        )
      )
      .limit(1);

    return row ? (row.role as WorkspaceRole) : null;
  }
}
