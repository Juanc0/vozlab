import {
  IJoinRequestRepository,
  JoinRequestStatus,
  JoinRequestWithUser,
} from '../../domain/ports/IJoinRequestRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';

export interface ListJoinRequestsInput {
  actorUserId: string;
  tid: string;
  workspaceId: string;
  status: JoinRequestStatus;
  limit: number;
}

/** Use Case: the inbox of requests to enter a workspace. */
export class ListJoinRequestsUseCase {
  constructor(
    private readonly joinRequestRepo: IJoinRequestRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly userRepo: IUserRepository
  ) {}

  async execute(input: ListJoinRequestsInput): Promise<JoinRequestWithUser[]> {
    await assertWorkspaceAdmin(
      input.actorUserId,
      input.workspaceId,
      input.tid,
      this.userRepo,
      this.membershipRepo
    );
    return this.joinRequestRepo.listByWorkspace(
      input.workspaceId,
      input.status,
      input.tid,
      input.limit
    );
  }
}
