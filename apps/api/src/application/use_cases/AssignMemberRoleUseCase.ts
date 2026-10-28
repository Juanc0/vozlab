import type { WorkspaceRole } from '@vozlab/shared-types';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IMembershipAdminRepository } from '../../domain/ports/IMembershipAdminRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { IWorkspaceRepository } from '../../domain/ports/IWorkspaceRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';

export interface AssignMemberRoleInput {
  actorUserId: string;
  tid: string;
  workspaceId: string;
  targetUserId: string;
  role: WorkspaceRole;
  reqId?: string;
}

export class AssignMemberRoleUseCase {
  constructor(
    private readonly membershipAdminRepo: IMembershipAdminRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly userRepo: IUserRepository,
    private readonly uow: IUnitOfWork
  ) {}

  async execute(input: AssignMemberRoleInput): Promise<void> {
    await assertWorkspaceAdmin(
      input.actorUserId,
      input.workspaceId,
      input.tid,
      this.userRepo,
      this.membershipRepo
    );

    const user = await this.userRepo.findById(input.targetUserId, input.tid);
    if (!user) throw new DomainError('ERR_USER_NOT_FOUND');

    await this.uow.runInTransaction(input.tid, async (tx) => {
      await this.membershipAdminRepo.upsertMember(
        {
          userId: input.targetUserId,
          workspaceId: input.workspaceId,
          role: input.role,
        },
        input.tid,
        tx
      );
      await this.membershipAdminRepo.recordEvent(
        {
          workspaceId: input.workspaceId,
          userId: input.targetUserId,
          actorType: 'ADMIN',
          actorId: input.actorUserId,
          action: 'ROLE_CHANGED',
          beforeRole: null,
          afterRole: input.role,
          requestId: input.reqId ?? null,
        },
        input.tid,
        tx
      );
    });
  }
}
