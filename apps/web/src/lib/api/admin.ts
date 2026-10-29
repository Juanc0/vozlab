import type { ApiClient } from './client';

/** A tenant linked to a global identity (`GET /auth/resolve-tenants`). */
export interface LinkedTenantDto {
  id: string;
  slug: string;
  status: string;
}

/**
 * First tenant choice right after the OIDC login (no session yet): the
 * callback redirected the browser to the selector with the `globalUserId`.
 * The API answers by setting the refresh cookie; the caller must then
 * `refreshSession` to pick the access token up.
 */
export async function selectTenant(
  client: ApiClient,
  globalUserId: string,
  tenantId: string
): Promise<void> {
  await client.request<{ accessToken: string }>({
    method: 'POST',
    path: '/auth/select-tenant',
    workspace: false,
    body: { globalUserId, tenantId }
  });
}

/**
 * Tenant change of an ACTIVE session (v6/TASK-01): Bearer-protected, it
 * validates the link and rotates the refresh cookie for the destination
 * tenant. No re-authentication. The caller must then `refreshSession` to
 * trade the new cookie for an access token.
 */
export async function switchTenant(
  client: ApiClient,
  globalUserId: string,
  tenantId: string
): Promise<void> {
  await client.request<{ tenantId: string }>({
    method: 'POST',
    path: '/auth/switch-tenant',
    workspace: false,
    body: { globalUserId, tenantId }
  });
}

/** The tenants linked to a global identity — the options of the selector. */
export async function listLinkedTenants(
  client: ApiClient,
  globalUserId: string
): Promise<LinkedTenantDto[]> {
  const body = await client.request<{ tenants: LinkedTenantDto[] }>({
    method: 'GET',
    path: '/auth/resolve-tenants',
    // Public route: the selector of the FIRST login has no session yet.
    auth: 'none',
    workspace: false,
    query: { globalUserId }
  });
  return body.tenants;
}
import type {
  AdminMemberDto,
  AdminUserDto,
  AdminWorkspaceDto,
  CreateWorkspaceInput,
  CreateWorkspaceInvitationInput,
  CreateWorkspaceInvitationResultDto,
  DiscoveredWorkspaceDto,
  JoinRequestDto,
  MyJoinRequestDto,
  UpdateWorkspaceInput
} from '@vozlab/shared-types';

export async function listAdminWorkspaces(client: ApiClient): Promise<AdminWorkspaceDto[]> {
  const body = await client.request<{ workspaces: AdminWorkspaceDto[] }>({
    method: 'GET',
    path: '/admin/workspaces',
    workspace: false
  });
  return body.workspaces;
}

export async function createAdminWorkspace(
  client: ApiClient,
  input: CreateWorkspaceInput
): Promise<AdminWorkspaceDto> {
  return client.request<AdminWorkspaceDto>({
    method: 'POST',
    path: '/admin/workspaces',
    workspace: false,
    body: input
  });
}

export async function listAdminUsers(
  client: ApiClient
): Promise<AdminUserDto[]> {
  const body = await client.request<{ users: AdminUserDto[]; nextCursor: string | null }>({
    method: 'GET',
    path: '/admin/users',
    workspace: false
  });
  return body.users;
}

export async function getAdminWorkspace(
  client: ApiClient,
  workspaceId: string
): Promise<AdminWorkspaceDto> {
  return client.request<AdminWorkspaceDto>({
    method: 'GET',
    path: `/workspaces/${workspaceId}`,
    workspace: true
  });
}

export async function updateAdminWorkspace(
  client: ApiClient,
  workspaceId: string,
  input: UpdateWorkspaceInput
): Promise<AdminWorkspaceDto> {
  return client.request<AdminWorkspaceDto>({
    method: 'PATCH',
    path: `/workspaces/${workspaceId}`,
    workspace: true,
    body: input
  });
}

export async function createJoinCode(
  client: ApiClient,
  workspaceId: string,
  input: { label?: string | null; expiresAt?: string | null; maxUses?: number | null; autoApprove?: boolean }
): Promise<{ id: string; code: string }> {
  return client.request<{ id: string; code: string }>({
    method: 'POST',
    path: `/workspaces/${workspaceId}/join-codes`,
    workspace: true,
    body: input
  });
}

export async function listJoinCodes(
  client: ApiClient,
  workspaceId: string
): Promise<Array<{ id: string; label: string | null; expiresAt: string | null; maxUses: number | null; usedCount: number; autoApprove: boolean; revokedAt: string | null }>> {
  const body = await client.request<{ codes: Array<{ id: string; label: string | null; expiresAt: string | null; maxUses: number | null; usedCount: number; autoApprove: boolean; revokedAt: string | null }> }>({
    method: 'GET',
    path: `/workspaces/${workspaceId}/join-codes`,
    workspace: true
  });
  return body.codes;
}

/**
 * PATCH the mutable attributes of an ephemeral join code (v6/TASK-04, B6):
 * label, expiry, cap and auto-approve. The secret itself never changes —
 * rotating stays a revoke + create.
 */
export async function updateJoinCode(
  client: ApiClient,
  workspaceId: string,
  codeId: string,
  patch: {
    label?: string | null;
    expiresAt?: string | null;
    maxUses?: number | null;
    autoApprove?: boolean;
  }
): Promise<void> {
  await client.requestVoid({
    method: 'PATCH',
    path: `/workspaces/${workspaceId}/join-codes/${codeId}`,
    workspace: true,
    body: patch
  });
}

export async function revokeJoinCode(
  client: ApiClient,
  workspaceId: string,
  codeId: string
): Promise<void> {
  await client.request({
    method: 'DELETE',
    path: `/workspaces/${workspaceId}/join-codes/${codeId}`,
    workspace: true
  });
}

export async function rotateJoinCode(
  client: ApiClient,
  workspaceId: string
): Promise<string> {
  const body = await client.request<{ joinCode: string }>({
    method: 'POST',
    path: `/workspaces/${workspaceId}/join-code/rotate`,
    workspace: true
  });
  return body.joinCode;
}

export async function listMembers(
  client: ApiClient,
  workspaceId: string
): Promise<AdminMemberDto[]> {
  const body = await client.request<{ members: AdminMemberDto[] }>({
    method: 'GET',
    path: `/workspaces/${workspaceId}/members`,
    workspace: true
  });
  return body.members;
}

export async function addMember(
  client: ApiClient,
  workspaceId: string,
  handle: string,
  role: string
): Promise<void> {
  await client.request({
    method: 'POST',
    path: `/workspaces/${workspaceId}/members`,
    workspace: true,
    body: { handle, role }
  });
}

export async function changeMemberRole(
  client: ApiClient,
  workspaceId: string,
  userId: string,
  role: string
): Promise<void> {
  await client.request({
    method: 'PATCH',
    path: `/workspaces/${workspaceId}/members/${userId}`,
    workspace: true,
    body: { role }
  });
}

export async function assignMemberRole(
  client: ApiClient,
  workspaceId: string,
  userId: string,
  role: string
): Promise<void> {
  await client.request({
    method: 'POST',
    path: `/workspaces/${workspaceId}/members/${userId}/roles`,
    workspace: true,
    body: { role }
  });
}

export async function removeMemberRole(
  client: ApiClient,
  workspaceId: string,
  userId: string,
  role: string
): Promise<void> {
  await client.request({
    method: 'DELETE',
    path: `/workspaces/${workspaceId}/members/${userId}/roles/${role}`,
    workspace: true
  });
}

export async function suspendMember(
  client: ApiClient,
  workspaceId: string,
  userId: string
): Promise<void> {
  await client.request({
    method: 'POST',
    path: `/workspaces/${workspaceId}/members/${userId}/suspend`,
    workspace: true
  });
}

export async function reactivateMember(
  client: ApiClient,
  workspaceId: string,
  userId: string
): Promise<void> {
  await client.request({
    method: 'POST',
    path: `/workspaces/${workspaceId}/members/${userId}/reactivate`,
    workspace: true
  });
}

export async function removeMember(
  client: ApiClient,
  workspaceId: string,
  userId: string
): Promise<void> {
  await client.request({
    method: 'DELETE',
    path: `/workspaces/${workspaceId}/members/${userId}`,
    workspace: true
  });
}

export async function listJoinRequests(
  client: ApiClient,
  workspaceId: string
): Promise<JoinRequestDto[]> {
  const body = await client.request<{ requests: JoinRequestDto[] }>({
    method: 'GET',
    path: `/workspaces/${workspaceId}/join-requests`,
    workspace: true
  });
  return body.requests;
}

export async function approveJoinRequest(
  client: ApiClient,
  workspaceId: string,
  requestId: string
): Promise<void> {
  await client.request({
    method: 'POST',
    path: `/workspaces/${workspaceId}/join-requests/${requestId}/approve`,
    workspace: true
  });
}

export async function rejectJoinRequest(
  client: ApiClient,
  workspaceId: string,
  requestId: string
): Promise<void> {
  await client.request({
    method: 'POST',
    path: `/workspaces/${workspaceId}/join-requests/${requestId}/reject`,
    workspace: true
  });
}

export async function listInvitations(
  client: ApiClient,
  workspaceId: string
): Promise<unknown[]> {
  const body = await client.request<{ invitations: unknown[] }>({
    method: 'GET',
    path: `/workspaces/${workspaceId}/invitations`,
    workspace: true
  });
  return body.invitations;
}

export async function createInvitation(
  client: ApiClient,
  workspaceId: string,
  input: CreateWorkspaceInvitationInput
): Promise<CreateWorkspaceInvitationResultDto> {
  return client.request<CreateWorkspaceInvitationResultDto>({
    method: 'POST',
    path: `/workspaces/${workspaceId}/invitations`,
    workspace: true,
    body: input
  });
}

export async function revokeInvitation(
  client: ApiClient,
  invitationId: string
): Promise<void> {
  await client.request({
    method: 'DELETE',
    path: `/invitations/${invitationId}`,
    workspace: true
  });
}

export async function createGlobalInvitation(
  client: ApiClient,
  input: { workspaceId: string; email: string; role: string; expiresAt: string; maxUses?: number | null }
): Promise<{ id: string; token: string }> {
  return client.request<{ id: string; token: string }>({
    method: 'POST',
    path: '/invitations/global',
    workspace: false,
    body: input
  });
}

// Access flows
export async function discoverWorkspaces(
  client: ApiClient
): Promise<DiscoveredWorkspaceDto[]> {
  const body = await client.request<{ workspaces: DiscoveredWorkspaceDto[] }>({
    method: 'GET',
    path: '/workspace-discovery',
    workspace: false
  });
  return body.workspaces;
}

export async function requestWorkspaceAccess(
  client: ApiClient,
  input: { workspaceId?: string; code?: string; message?: string }
): Promise<MyJoinRequestDto> {
  return client.request<MyJoinRequestDto>({
    method: 'POST',
    path: '/workspace-join-requests',
    workspace: false,
    body: input
  });
}

export async function listMyJoinRequests(
  client: ApiClient
): Promise<MyJoinRequestDto[]> {
  const body = await client.request<{ requests: MyJoinRequestDto[] }>({
    method: 'GET',
    path: '/workspace-join-requests',
    workspace: false
  });
  return body.requests;
}