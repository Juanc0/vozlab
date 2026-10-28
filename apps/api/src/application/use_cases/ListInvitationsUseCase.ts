import { IInvitationAdminRepository } from '../../domain/ports/IInvitationAdminRepository.js';
import { Invitation } from '../../domain/ports/IInvitationRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';

export interface ListInvitationsInput {
  actorUserId: string;
  tid: string;
  workspaceId: string;
}

/** Use Case: the invitation history of a workspace (never the token). */
export class ListInvitationsUseCase {
  constructor(
    private readonly invitationAdminRepo: IInvitationAdminRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly userRepo: IUserRepository
  ) {}

  async execute(input: ListInvitationsInput): Promise<Invitation[]> {
    await assertWorkspaceAdmin(
      input.actorUserId,
      input.workspaceId,
      input.tid,
      this.userRepo,
      this.membershipRepo
    );
    return this.invitationAdminRepo.listByWorkspace(
      input.workspaceId,
      input.tid
    );
  }
}
