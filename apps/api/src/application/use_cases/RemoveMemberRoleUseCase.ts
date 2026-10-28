import type { WorkspaceRole } from '@vozlab/shared-types';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IMembershipAdminRepository } from '../../domain/ports/IMembershipAdminRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { IWorkspaceRepository } from '../../domain/ports/IWorkspaceRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';

export interface RemoveMemberRoleInput {
  actorUserId: string;
  tid: string;
  workspaceId: string;
  targetUserId: string;
  role: WorkspaceRole;
  reqId?: string;
}

export class RemoveMemberRoleUseCase {
  constructor(
    private readonly membershipAdminRepo: IMembershipAdminRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly workspaceRepo: IWorkspaceRepository,
    private readonly userRepo: IUserRepository,
    private readonly uow: IUnitOfWork
  ) {}

  async execute(input: RemoveMemberRoleInput): Promise<void> {
    await assertWorkspaceAdmin(
      input.actorUserId,
      input.workspaceId,
      input.tid,
      this.userRepo,
      this.membershipRepo
    );

    const removingAdmin = input.role === 'ADMIN';

    await this.uow.runInTransaction(input.tid, async (tx) => {
      if (removingAdmin) {
        const workspace = await this.workspaceRepo.lockById(
          input.workspaceId,
          input.tid,
          tx
        );
        if (!workspace) throw new DomainError('ERR_WORKSPACE_NOT_FOUND');

        const admins = await this.membershipAdminRepo.countActiveAdmins(
          input.workspaceId,
          input.tid,
          tx
        );
        if (admins <= 1) {
          throw new DomainError('ERR_LAST_WORKSPACE_ADMIN');
        }
      }

      await this.membershipAdminRepo.removeRole(
        input.targetUserId,
        input.workspaceId,
        input.role,
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
          beforeRole: input.role,
          afterRole: null,
          requestId: input.reqId ?? null,
        },
        input.tid,
        tx
      );
    });
  }
}
