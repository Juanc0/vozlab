import { DomainError } from '../../domain/errors/DomainError.js';
import type { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import type { IUserRepository } from '../../domain/ports/IUserRepository.js';

/**
 * Administrative authorization (US-00).
 *
 * The role is always resolved from the tenant database, never from the JWT:
 * `system_role` and a workspace role can change while a token is still valid.
 * The HTTP guards and the use cases share these predicates so an endpoint
 * cannot drift from the rule the use case enforces.
 */

export interface UserLookup {
  findById(
    userId: string,
    tid: string
  ): Promise<{ systemRole: string } | null>;
}

export interface MembershipRoleLookup {
  getRole(
    userId: string,
    workspaceId: string,
    tid: string
  ): Promise<'ADMIN' | 'MODERATOR' | 'MEMBER' | 'GUEST' | null>;
}

/** Tenant ADMIN (`auth.users.system_role = 'ADMIN'`). */
export async function assertTenantAdmin(
  actorUserId: string,
  tid: string,
  userRepo: UserLookup
): Promise<void> {
  const user = await userRepo.findById(actorUserId, tid);
  if (!user) {
    throw new DomainError('ERR_INVALID_TOKEN');
  }
  if (user.systemRole !== 'ADMIN') {
    throw new DomainError('ERR_AUTHORIZATION_FAILED');
  }
}

/**
 * A tenant ADMIN manages any workspace; a workspace ADMIN only the workspace
 * where the membership is ACTIVE. Returns whether the actor is a tenant admin
 * so the caller can apply tenant-wide rules (for example, allowing the
 * `X-Workspace-ID` header to differ from the path).
 */
export async function assertWorkspaceAdmin(
  actorUserId: string,
  workspaceId: string,
  tid: string,
  userRepo: UserLookup,
  membershipRepo: MembershipRoleLookup
): Promise<{ isTenantAdmin: boolean }> {
  const user = await userRepo.findById(actorUserId, tid);
  if (!user) {
    throw new DomainError('ERR_INVALID_TOKEN');
  }
  if (user.systemRole === 'ADMIN') {
    return { isTenantAdmin: true };
  }

  const role = await membershipRepo.getRole(actorUserId, workspaceId, tid);
  if (role !== 'ADMIN') {
    throw new DomainError('ERR_AUTHORIZATION_FAILED');
  }
  return { isTenantAdmin: false };
}

/** Re-exported for callers that already hold an `IUserRepository`. */
export type TenantAdminUserRepository = Pick<IUserRepository, 'findById'>;
/** Re-exported for callers that already hold an `IMembershipRepository`. */
export type WorkspaceRoleRepository = Pick<IMembershipRepository, 'getRole'>;
