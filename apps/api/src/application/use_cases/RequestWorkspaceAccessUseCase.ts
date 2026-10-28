import { DomainError } from '../../domain/errors/DomainError.js';
import {
  IJoinRequestRepository,
  JoinRequestWithWorkspace,
} from '../../domain/ports/IJoinRequestRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import {
  IWorkspaceRepository,
  WorkspaceRecord,
} from '../../domain/ports/IWorkspaceRepository.js';

export interface RequestWorkspaceAccessInput {
  userId: string;
  tid: string;
  workspaceId?: string;
  code?: string;
  message?: string;
}

/**
 * Use Case: ask to enter a workspace (US-00).
 *
 * A public workspace can be asked for by id. A private one only through its
 * join code: its existence is never confirmed to somebody who does not hold
 * the code. In both cases the answer is a PENDING request — a request is a
 * hint, never a grant.
 */
export class RequestWorkspaceAccessUseCase {
  constructor(
    private readonly workspaceRepo: IWorkspaceRepository,
    private readonly joinRequestRepo: IJoinRequestRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly userRepo?: IUserRepository
  ) {}

  async execute(
    input: RequestWorkspaceAccessInput
  ): Promise<JoinRequestWithWorkspace> {
    let workspace: WorkspaceRecord | null = null;
    if (input.code !== undefined && input.code !== '') {
      workspace = await this.workspaceRepo.findByJoinCode(input.code, input.tid);
    } else if (input.workspaceId !== undefined && input.workspaceId !== '') {
      workspace = await this.workspaceRepo.findById(
        input.workspaceId,
        input.tid
      );
      // A private workspace is only reachable with its code: by id it simply
      // does not exist for a user who is not already a member.
      if (workspace && !workspace.isPublic) {
        workspace = null;
      }
    }

    if (!workspace) {
      throw new DomainError('ERR_WORKSPACE_NOT_FOUND');
    }

    // v6: GUEST (anonymous) cannot request access to non-EVENT workspaces.
    if (this.userRepo) {
      const user = await this.userRepo.findById(input.userId, input.tid);
      if (user && user.provider === 'ANONYMOUS_EVENT' && workspace.kind !== 'EVENT') {
        throw new DomainError('ERR_AUTHORIZATION_FAILED');
      }
    }

    const role = await this.membershipRepo.getRole(
      input.userId,
      workspace.id,
      input.tid
    );
    if (role !== null) {
      throw new DomainError('ERR_ALREADY_MEMBER');
    }

    const pending = await this.joinRequestRepo.findPending(
      workspace.id,
      input.userId,
      input.tid
    );
    if (pending) {
      return { ...pending, workspaceName: workspace.name };
    }

    const created = await this.joinRequestRepo.create(
      {
        workspaceId: workspace.id,
        userId: input.userId,
        message: input.message ?? null,
      },
      input.tid
    );
    return { ...created, workspaceName: workspace.name };
  }
}
