import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import {
  IWorkspaceRepository,
  WorkspaceWithStats,
} from '../../domain/ports/IWorkspaceRepository.js';
import { assertTenantAdmin } from '../policies/workspaceAdminPolicy.js';

export interface ListWorkspacesInput {
  actorUserId: string;
  tid: string;
}

/**
 * Use Case: the tenant-wide workspace list (US-00).
 *
 * Only a tenant ADMIN sees every workspace of the institution; a workspace
 * ADMIN uses `GetWorkspaceUseCase` for its own.
 */
export class ListWorkspacesUseCase {
  constructor(
    private readonly workspaceRepo: IWorkspaceRepository,
    private readonly userRepo: IUserRepository
  ) {}

  async execute(input: ListWorkspacesInput): Promise<WorkspaceWithStats[]> {
    await assertTenantAdmin(input.actorUserId, input.tid, this.userRepo);
    return this.workspaceRepo.listWithStats(input.tid);
  }
}
