import { DomainError } from '../../domain/errors/DomainError.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import {
  IWorkspaceRepository,
  WorkspaceRecord,
} from '../../domain/ports/IWorkspaceRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';
import { IAuditLog } from '../../domain/ports/IAuditLog.js';
import { generateJoinCode } from './CreateWorkspaceUseCase.js';

export interface RotateJoinCodeInput {
  actorUserId: string;
  tid: string;
  workspaceId: string;
}

/**
 * Use Case: rotate the routing hint of a workspace.
 *
 * The code identifies a private workspace to a user who was told it; it
 * never grants access. Rotating it invalidates the previous hint without
 * touching any membership.
 */
export class RotateJoinCodeUseCase {
  constructor(
    private readonly workspaceRepo: IWorkspaceRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly userRepo: IUserRepository,
    private readonly audit?: IAuditLog
  ) {}

  async execute(input: RotateJoinCodeInput): Promise<WorkspaceRecord> {
    await assertWorkspaceAdmin(
      input.actorUserId,
      input.workspaceId,
      input.tid,
      this.userRepo,
      this.membershipRepo
    );

    const workspace = await this.workspaceRepo.update(
      input.workspaceId,
      { joinCode: generateJoinCode() },
      input.tid
    );
    if (!workspace) {
      throw new DomainError('ERR_WORKSPACE_NOT_FOUND');
    }
    await this.audit?.record({
      actorId: input.actorUserId,
      actorType: 'ADMIN',
      action: 'JOIN_CODE_ROTATED',
      targetType: 'workspace',
      targetId: input.workspaceId,
      tenantId: input.tid,
    });
    return workspace;
  }
}
