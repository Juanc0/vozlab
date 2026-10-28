import { DomainError } from '../../domain/errors/DomainError.js';
import { IMembershipAdminRepository } from '../../domain/ports/IMembershipAdminRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { IWorkspaceRepository } from '../../domain/ports/IWorkspaceRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';

export interface RemoveMemberInput {
  actorUserId: string;
  tid: string;
  workspaceId: string;
  targetUserId: string;
  reqId?: string;
}

/**
 * Use Case: remove a membership (status → REMOVED).
 *
 * Removal is a status change, not a delete: the audit trail of the workspace
 * keeps the row. An administrator cannot remove themselves, and the last
 * active ADMIN cannot be removed.
 */
export class RemoveMemberUseCase {
  constructor(
    private readonly membershipAdminRepo: IMembershipAdminRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly workspaceRepo: IWorkspaceRepository,
    private readonly userRepo: IUserRepository,
    private readonly uow: IUnitOfWork
  ) {}

  async execute(input: RemoveMemberInput): Promise<void> {
    await assertWorkspaceAdmin(
      input.actorUserId,
      input.workspaceId,
      input.tid,
      this.userRepo,
      this.membershipRepo
    );

    if (input.actorUserId === input.targetUserId) {
      throw new DomainError('ERR_CANNOT_MODIFY_SELF');
    }

    const member = await this.membershipAdminRepo.find(
      input.targetUserId,
      input.workspaceId,
      input.tid
    );
    if (!member || member.status === 'REMOVED') {
      throw new DomainError('ERR_MEMBER_NOT_FOUND');
    }

    const removingAdmin = member.role === 'ADMIN' && member.status === 'ACTIVE';

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

      await this.membershipRepo.remove(
        input.targetUserId,
        input.workspaceId,
        input.tid,
        tx
      );
      await this.membershipAdminRepo.recordEvent(
        {
          workspaceId: input.workspaceId,
          userId: input.targetUserId,
          actorType: 'ADMIN',
          actorId: input.actorUserId,
          action: 'REMOVED',
          beforeRole: member.role,
          afterRole: null,
          requestId: input.reqId ?? null,
        },
        input.tid,
        tx
      );
    });
  }
}
