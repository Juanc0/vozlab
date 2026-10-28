import {
  DiscoveredWorkspace,
  IWorkspaceRepository,
} from '../../domain/ports/IWorkspaceRepository.js';

export interface DiscoverWorkspacesInput {
  userId: string;
  tid: string;
}

/**
 * Use Case: the public workspaces a user may ask to enter.
 *
 * A workspace the user already belongs to is not offered. One with a pending
 * request is offered flagged as `pendingRequest`, so the screen says
 * “requested” instead of letting the user ask twice.
 */
export class DiscoverWorkspacesUseCase {
  constructor(private readonly workspaceRepo: IWorkspaceRepository) {}

  async execute(
    input: DiscoverWorkspacesInput
  ): Promise<DiscoveredWorkspace[]> {
    return this.workspaceRepo.listPublicForUser(input.tid, input.userId);
  }
}
