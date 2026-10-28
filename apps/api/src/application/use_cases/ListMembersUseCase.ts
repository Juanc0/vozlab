import {
  AdminMembershipRecord,
  IMembershipAdminRepository,
} from '../../domain/ports/IMembershipAdminRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';

export interface ListMembersInput {
  actorUserId: string;
  tid: string;
  workspaceId: string;
}

/** Use Case: the member list of a workspace (active, suspended and removed). */
export class ListMembersUseCase {
  constructor(
    private readonly membershipAdminRepo: IMembershipAdminRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly userRepo: IUserRepository
  ) {}

  async execute(input: ListMembersInput): Promise<AdminMembershipRecord[]> {
    await assertWorkspaceAdmin(
      input.actorUserId,
      input.workspaceId,
      input.tid,
      this.userRepo,
      this.membershipRepo
    );
    return this.membershipAdminRepo.listByWorkspace(
      input.workspaceId,
      input.tid
    );
  }
}
