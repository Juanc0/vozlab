import { z } from 'zod';
import { WorkspaceRoleSchema } from './roles.schema.js';

/**
 * Tenant and workspace administration contracts (US-00).
 *
 * The tenant is fixed by the verified `tid` claim; nothing here accepts a
 * tenant as input. A workspace code identifies a workspace but never grants
 * access: it only creates a join request that an admin still has to approve.
 */

/** A workspace slug: lowercase words separated by single hyphens. */
export const WorkspaceSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase letters, digits and single hyphens',
  });

/** `POST /api/v1/admin/workspaces` */
export const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(255),
  slug: WorkspaceSlugSchema,
  description: z.string().trim().max(500).nullish(),
  isPublic: z.boolean().default(true),
});
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;

/** `PATCH /api/v1/workspaces/:workspaceId` */
export const UpdateWorkspaceSchema = z
  .object({
    name: z.string().trim().min(2).max(255).optional(),
    description: z.string().trim().max(500).nullish(),
    isPublic: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.isPublic !== undefined,
    { message: 'at least one field is required' }
  );
export type UpdateWorkspaceInput = z.infer<typeof UpdateWorkspaceSchema>;

/** `POST /api/v1/workspaces/:workspaceId/members` — add a user already in the tenant. */
export const AddWorkspaceMemberSchema = z.object({
  handle: z.string().trim().min(1).max(64).optional(),
  globalUserId: z.string().uuid().optional(),
  role: WorkspaceRoleSchema.default('MEMBER'),
}).refine((d) => d.handle || d.globalUserId, {
  message: 'one of handle or globalUserId is required',
});
export type AddWorkspaceMemberInput = z.infer<typeof AddWorkspaceMemberSchema>;

/** `PATCH /api/v1/workspaces/:workspaceId/members/:userId` */
export const ChangeWorkspaceMemberRoleSchema = z.object({
  role: WorkspaceRoleSchema,
});
export type ChangeWorkspaceMemberRoleInput = z.infer<
  typeof ChangeWorkspaceMemberRoleSchema
>;

/** `POST /api/v1/workspaces/:workspaceId/invitations` */
export const CreateWorkspaceInvitationSchema = z.object({
  email: z.string().trim().email().max(255),
  role: WorkspaceRoleSchema.default('MEMBER'),
});
export type CreateWorkspaceInvitationInput = z.infer<
  typeof CreateWorkspaceInvitationSchema
>;

/** `POST /api/v1/workspace-join-requests` */
export const RequestWorkspaceAccessSchema = z
  .object({
    workspaceId: z.string().uuid().optional(),
    code: z.string().trim().min(3).max(24).optional(),
    message: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.workspaceId !== undefined || value.code !== undefined, {
    message: 'workspaceId or code is required',
  });
export type RequestWorkspaceAccessInput = z.infer<
  typeof RequestWorkspaceAccessSchema
>;

/** `POST /api/v1/workspaces/:workspaceId/join-requests/:requestId/approve` */
export const ApproveJoinRequestSchema = z.object({
  role: WorkspaceRoleSchema.default('MEMBER'),
});
export type ApproveJoinRequestInput = z.infer<typeof ApproveJoinRequestSchema>;

/** Query of the tenant user list. */
export const AdminUserListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(500).optional(),
});
export type AdminUserListQuery = z.infer<typeof AdminUserListQuerySchema>;

/** Query of the join-request inbox. */
export const JoinRequestListQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type JoinRequestListQuery = z.infer<typeof JoinRequestListQuerySchema>;

/** A workspace this user belongs to, as seen from the administration screen. */
export interface AdminUserMembershipDto {
  workspaceId: string;
  workspaceName: string;
  role: z.infer<typeof WorkspaceRoleSchema>;
  status: string;
}

/** A tenant user, with the memberships the screen needs to explain them. */
export interface AdminUserDto {
  id: string;
  /** Lookup alias (DEC-4: the tenant stores no email). */
  handle: string | null;
  fullName: string | null;
  systemRole: string;
  provider: string;
  createdAt: string;
  memberships: AdminUserMembershipDto[];
}

/** A workspace and the counters of the administration screen. */
export interface AdminWorkspaceDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  kind: string;
  autoApproveJoinCode: boolean;
  joinCode: string;
  createdAt: string;
  memberCount: number;
  pendingRequestCount: number;
}

/** A member of a workspace. */
export interface AdminMemberDto {
  userId: string;
  /** Lookup alias (DEC-4: the tenant stores no email). */
  handle: string | null;
  fullName: string | null;
  role: z.infer<typeof WorkspaceRoleSchema>;
  status: string;
  joinedAt: string;
}

/** A request to enter a workspace, for the admin inbox. */
export interface JoinRequestDto {
  id: string;
  workspaceId: string;
  userId: string;
  /** Lookup alias of the requester (DEC-4: no email bytes on the wire). */
  handle: string | null;
  fullName: string | null;
  status: string;
  message: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** A user's own join request. */
export interface MyJoinRequestDto {
  id: string;
  workspaceId: string;
  workspaceName: string;
  status: string;
  message: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** A public workspace the caller may ask to join. */
export interface DiscoveredWorkspaceDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  /** `true` when the caller already has a PENDING request for it. */
  pendingRequest: boolean;
}

/** An invitation, without its token. */
export interface WorkspaceInvitationDto {
  id: string;
  workspaceId: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

/** The one-time answer of the invitation creation: the copyable link. */
export interface CreateWorkspaceInvitationResultDto {
  invitation: WorkspaceInvitationDto;
  /** `${WEB_ORIGIN}/login?invitation=<token>` — shown once. */
  url: string;
}
