import type {
  AdminMemberDto,
  AdminUserDto,
  AdminWorkspaceDto,
  DiscoveredWorkspaceDto,
  JoinRequestDto,
  MyJoinRequestDto,
  WorkspaceInvitationDto,
} from '@vozlab/shared-types';
import type { AdminMembershipRecord } from '../../../domain/ports/IMembershipAdminRepository.js';
import type { Invitation } from '../../../domain/ports/IInvitationRepository.js';
import type {
  JoinRequestWithUser,
  JoinRequestWithWorkspace,
} from '../../../domain/ports/IJoinRequestRepository.js';
import type { TenantUserRecord } from '../../../domain/ports/ITenantAdminRepository.js';
import type {
  DiscoveredWorkspace,
  WorkspaceWithStats,
} from '../../../domain/ports/IWorkspaceRepository.js';

/**
 * HTTP projections of the administration read models (US-00).
 *
 * The joins and the authorization live in the use cases; these functions
 * only translate a persisted record into the shared DTO, including the
 * ISO-8601 timestamps the PWA expects.
 */
export function toAdminWorkspaceDto(
  workspace: WorkspaceWithStats
): AdminWorkspaceDto {
  return {
    id: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
    description: workspace.description,
    isPublic: workspace.isPublic,
    kind: workspace.kind,
    autoApproveJoinCode: workspace.autoApproveJoinCode,
    joinCode: workspace.joinCode,
    createdAt: workspace.createdAt.toISOString(),
    memberCount: workspace.memberCount,
    pendingRequestCount: workspace.pendingRequestCount,
  };
}

export function toAdminUserDto(user: TenantUserRecord): AdminUserDto {
  return {
    id: user.id,
    handle: user.handle,
    fullName: user.fullName,
    systemRole: user.systemRole,
    provider: user.provider,
    createdAt: user.createdAt.toISOString(),
    memberships: user.memberships.map((membership) => ({
      workspaceId: membership.workspaceId,
      workspaceName: membership.workspaceName,
      role: membership.role as AdminUserDto['memberships'][number]['role'],
      status: membership.status,
    })),
  };
}

export function toAdminMemberDto(member: AdminMembershipRecord): AdminMemberDto {
  return {
    userId: member.userId,
    handle: member.handle,
    fullName: member.fullName,
    role: member.role,
    status: member.status,
    joinedAt: member.joinedAt.toISOString(),
  };
}

export function toJoinRequestDto(request: JoinRequestWithUser): JoinRequestDto {
  return {
    id: request.id,
    workspaceId: request.workspaceId,
    userId: request.userId,
    handle: request.handle,
    fullName: request.fullName,
    status: request.status,
    message: request.message,
    createdAt: request.createdAt.toISOString(),
    decidedAt: request.decidedAt?.toISOString() ?? null,
  };
}

export function toMyJoinRequestDto(
  request: JoinRequestWithWorkspace
): MyJoinRequestDto {
  return {
    id: request.id,
    workspaceId: request.workspaceId,
    workspaceName: request.workspaceName,
    status: request.status,
    message: request.message,
    createdAt: request.createdAt.toISOString(),
    decidedAt: request.decidedAt?.toISOString() ?? null,
  };
}

export function toDiscoveredWorkspaceDto(
  workspace: DiscoveredWorkspace
): DiscoveredWorkspaceDto {
  return {
    id: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
    description: workspace.description,
    isPublic: workspace.isPublic,
    pendingRequest: workspace.pendingRequest,
  };
}

export function toWorkspaceInvitationDto(
  invitation: Invitation
): WorkspaceInvitationDto {
  return {
    id: invitation.id,
    workspaceId: invitation.workspaceId,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  };
}
