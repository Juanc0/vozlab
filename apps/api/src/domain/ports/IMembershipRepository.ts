import type { WorkspaceRole } from '@vozlab/shared-types';
import type { DbTransaction } from './Transaction.js';

/**
 * Roles a user can hold inside a workspace (`auth.workspace_memberships.role`).
 * Declared once by `WorkspaceRoleSchema` in `@vozlab/shared-types` and
 * re-exported here so existing imports keep working.
 */
export type { WorkspaceRole };

/**
 * Port: Workspace membership contract.
 * Implementations live in infrastructure/ (e.g. DrizzleMembershipRepository).
 *
 * The membership table lives in the tenant's physical database, so every
 * method is scoped by `tid` — the pool manager resolves the dedicated
 * tenant connection.
 */
export interface IMembershipRepository {
  isMember(userId: string, workspaceId: string, tid: string): Promise<boolean>;
  getRole(userId: string, workspaceId: string, tid: string): Promise<WorkspaceRole | null>;
  /** v5: all roles held by the user in the workspace (union). */
  getRoles(userId: string, workspaceId: string, tid: string): Promise<WorkspaceRole[]>;
  /**
   * Add a membership (event join). Idempotent: a duplicate membership is a
   * no-op thanks to `uniq_memberships_workspace_user`.
   */
  add(
    userId: string,
    workspaceId: string,
    role: WorkspaceRole,
    tid: string,
    tx?: DbTransaction
  ): Promise<void>;
  /** Change the role of an existing membership. */
  changeRole(
    userId: string,
    workspaceId: string,
    newRole: WorkspaceRole,
    tid: string,
    tx?: DbTransaction
  ): Promise<void>;
  /** Suspend a membership (status → SUSPENDED). */
  suspend(
    userId: string,
    workspaceId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<void>;
  /** Reactivate a suspended membership (status → ACTIVE). */
  reactivate(
    userId: string,
    workspaceId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<void>;
  /** Remove a membership (status → REMOVED). */
  remove(
    userId: string,
    workspaceId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<void>;
}
