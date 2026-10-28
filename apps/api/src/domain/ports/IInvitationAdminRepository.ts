import type { Invitation } from './IInvitationRepository.js';
import type { DbTransaction } from './Transaction.js';

/**
 * Administrative reads over `auth.invitations` (US-00).
 *
 * Creation and redemption keep using `IInvitationRepository`; this port only
 * adds the listing and the revocation that the admin screen needs.
 */
export interface IInvitationAdminRepository {
  findById(invitationId: string, tid: string): Promise<Invitation | null>;

  listByWorkspace(workspaceId: string, tid: string): Promise<Invitation[]>;

  /**
   * Revoke one PENDING invitation by id. Returns `false` when it was no
   * longer pending, so two revocations cannot both report success.
   */
  revokeById(
    invitationId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<boolean>;

  /**
   * Revoke every PENDING invitation for an email in a workspace. Creating a
   * new invitation invalidates the previous link, so a leaked old link does
   * not survive a re-send.
   */
  revokePendingForEmail(
    workspaceId: string,
    email: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<number>;
}
