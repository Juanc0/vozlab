import { z } from 'zod';

/**
 * Workspace roles — the role a user holds *inside* a workspace
 * (`auth.workspace_memberships.role`).
 *
 * Single source of truth for the union: the domain port
 * (`IMembershipRepository`) re-exports the type, and every boundary check
 * (`isModeratorOrAdmin`) consumes it. Keep in sync with
 * `packages/database/src/schema/tenant.auth.schema.ts`.
 */
export const WorkspaceRoleSchema = z.enum(['ADMIN', 'MODERATOR', 'MEMBER', 'GUEST']);
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;

/**
 * System roles — platform-level role on `auth.users.system_role`, orthogonal to
 * a workspace membership. Keep in sync with
 * `packages/database/src/schema/tenant.auth.schema.ts`.
 */
export const SystemRoleSchema = z.enum([
  'USER',
  'ADMIN',
  'MODERATOR',
  'SYSTEM_AGENT',
]);
export type SystemRole = z.infer<typeof SystemRoleSchema>;

/**
 * Workspace roles that may resolve governance items (FR-09/FR-12). Declared
 * from the schema members so the policy never restates the literals.
 */
const GOVERNANCE_ROLES: ReadonlySet<WorkspaceRole> = new Set([
  WorkspaceRoleSchema.enum.ADMIN,
  WorkspaceRoleSchema.enum.MODERATOR,
]);

/** ADMIN or MODERATOR may resolve governance items (FR-09/FR-12 roles). */
export function isModeratorOrAdmin(role: WorkspaceRole | null): boolean {
  return role !== null && GOVERNANCE_ROLES.has(role);
}
