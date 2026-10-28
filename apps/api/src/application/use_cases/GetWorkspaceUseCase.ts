import { DomainError } from '../../domain/errors/DomainError.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import {
  IWorkspaceRepository,
  WorkspaceWithStats,
} from '../../domain/ports/IWorkspaceRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';

export interface GetWorkspaceInput {
  actorUserId: string;
  tid: string;
  workspaceId: string;
}

/** Use Case: one workspace and its counters, for a workspace administrator. */
export class GetWorkspaceUseCase {
  constructor(
    private readonly workspaceRepo: IWorkspaceRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly userRepo: IUserRepository
  ) {}

  async execute(input: GetWorkspaceInput): Promise<WorkspaceWithStats> {
    await assertWorkspaceAdmin(
      input.actorUserId,
      input.workspaceId,
      input.tid,
      this.userRepo,
      this.membershipRepo
    );

    const stats = await this.workspaceRepo.getStats(
      input.workspaceId,
      input.tid
    );
    if (!stats) {
      throw new DomainError('ERR_WORKSPACE_NOT_FOUND');
    }
    return stats;
  }
}
