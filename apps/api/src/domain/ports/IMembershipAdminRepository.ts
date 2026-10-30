import type { WorkspaceRole } from '@vozlab/shared-types';
import type { DbTransaction } from './Transaction.js';

/** A membership joined with the user it belongs to. */
export interface AdminMembershipRecord {
  userId: string;
  handle: string | null;
  fullName: string | null;
  role: WorkspaceRole;
  status: string;
  joinedAt: Date;
}

export interface UpsertMembershipInput {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
}

/** The append-only audit row written on every administrative change. */
export interface MembershipAuditEventInput {
  workspaceId: string;
  userId: string | null;
  invitationId?: string | null;
  actorType: 'USER' | 'ADMIN' | 'SYSTEM';
  actorId: string | null;
  action:
    | 'ADDED'
    | 'REACTIVATED'
    | 'ROLE_CHANGED'
    | 'SUSPENDED'
    | 'REMOVED'
    | 'JOIN_APPROVED'
    | 'JOIN_REJECTED'
    | 'INVITED'
    | 'INVITATION_ACCEPTED'
    | 'INVITATION_REVOKED'
    | 'WORKSPACE_CREATED';
  beforeRole?: string | null;
  afterRole?: string | null;
  reason?: string | null;
  requestId?: string | null;
}

/**
 * Port: administrative reads and writes over `auth.workspace_memberships`
 * plus the append-only `auth.membership_events` audit.
 *
 * Kept apart from `IMembershipRepository` so the zero-trust guard keeps its
 * narrow contract (role resolution only).
 */
export interface IMembershipAdminRepository {
  find(
    userId: string,
    workspaceId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<AdminMembershipRecord | null>;

  listByWorkspace(workspaceId: string, tid: string): Promise<AdminMembershipRecord[]>;

  /** Insert or revive a membership (direct add, join approval). */
  upsertMember(
    input: UpsertMembershipInput,
    tid: string,
    tx?: DbTransaction
  ): Promise<void>;

  /** Remove a single role row for a user in a workspace (multi-role). */
  removeRole(
    userId: string,
    workspaceId: string,
    role: WorkspaceRole,
    tid: string,
    tx?: DbTransaction
  ): Promise<void>;

  /** Active ADMIN memberships of a workspace, inside the caller's transaction. */
  countActiveAdmins(
    workspaceId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<number>;

  recordEvent(
    input: MembershipAuditEventInput,
    tid: string,
    tx?: DbTransaction
  ): Promise<void>;
}
