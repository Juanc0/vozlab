import { DomainError } from '../../domain/errors/DomainError.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import {
  IWorkspaceRepository,
  UpdateWorkspacePatch,
  WorkspaceWithStats,
} from '../../domain/ports/IWorkspaceRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';

export interface UpdateWorkspaceInput {
  actorUserId: string;
  tid: string;
  workspaceId: string;
  patch: UpdateWorkspacePatch;
}

/** Use Case: configure a workspace (name, description, visibility). */
export class UpdateWorkspaceUseCase {
  constructor(
    private readonly workspaceRepo: IWorkspaceRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly userRepo: IUserRepository
  ) {}

  async execute(input: UpdateWorkspaceInput): Promise<WorkspaceWithStats> {
    await assertWorkspaceAdmin(
      input.actorUserId,
      input.workspaceId,
      input.tid,
      this.userRepo,
      this.membershipRepo
    );

    const workspace = await this.workspaceRepo.findById(
      input.workspaceId,
      input.tid
    );
    if (!workspace) {
      throw new DomainError('ERR_WORKSPACE_NOT_FOUND');
    }

    await this.workspaceRepo.update(
      input.workspaceId,
      input.patch,
      input.tid
    );

    const stats = await this.workspaceRepo.getStats(input.workspaceId, input.tid);
    return stats ?? { ...workspace, memberCount: 0, pendingRequestCount: 0 };
  }
}
