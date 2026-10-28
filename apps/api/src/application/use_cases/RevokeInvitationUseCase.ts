import { DomainError } from '../../domain/errors/DomainError.js';
import { IInvitationAdminRepository } from '../../domain/ports/IInvitationAdminRepository.js';
import { IMembershipAdminRepository } from '../../domain/ports/IMembershipAdminRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';

export interface RevokeInvitationInput {
  actorUserId: string;
  tid: string;
  workspaceId: string;
  invitationId: string;
  reqId?: string;
}

/**
 * Use Case: revoke a pending invitation.
 *
 * The invitation must belong to the workspace the caller administers; an id
 * from another workspace is answered as not found, never as forbidden.
 */
export class RevokeInvitationUseCase {
  constructor(
    private readonly invitationAdminRepo: IInvitationAdminRepository,
    private readonly membershipAdminRepo: IMembershipAdminRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly userRepo: IUserRepository
  ) {}

  async execute(input: RevokeInvitationInput): Promise<void> {
    await assertWorkspaceAdmin(
      input.actorUserId,
      input.workspaceId,
      input.tid,
      this.userRepo,
      this.membershipRepo
    );

    const invitation = await this.invitationAdminRepo.findById(
      input.invitationId,
      input.tid
    );
    if (!invitation || invitation.workspaceId !== input.workspaceId) {
      throw new DomainError('ERR_INVITATION_NOT_FOUND');
    }
    if (invitation.status !== 'PENDING') {
      throw new DomainError('ERR_INVITATION_NOT_PENDING');
    }

    const revoked = await this.invitationAdminRepo.revokeById(
      invitation.id,
      input.tid
    );
    if (!revoked) {
      throw new DomainError('ERR_INVITATION_NOT_PENDING');
    }

    await this.membershipAdminRepo.recordEvent(
      {
        workspaceId: input.workspaceId,
        userId: null,
        invitationId: invitation.id,
        actorType: 'ADMIN',
        actorId: input.actorUserId,
        action: 'INVITATION_REVOKED',
        requestId: input.reqId ?? null,
      },
      input.tid
    );
  }
}
