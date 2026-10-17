import type { WorkspaceRole } from '@vozlab/shared-types';

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
}
