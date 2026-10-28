import { DomainError } from '../../domain/errors/DomainError.js';
import { IMembershipAdminRepository } from '../../domain/ports/IMembershipAdminRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';

export interface ReactivateMemberInput {
  actorUserId: string;
  tid: string;
  workspaceId: string;
  targetUserId: string;
  reqId?: string;
}

/** Use Case: revive a suspended membership. */
export class ReactivateMemberUseCase {
  constructor(
    private readonly membershipAdminRepo: IMembershipAdminRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly userRepo: IUserRepository,
    private readonly uow: IUnitOfWork
  ) {}

  async execute(input: ReactivateMemberInput): Promise<void> {
    await assertWorkspaceAdmin(
      input.actorUserId,
      input.workspaceId,
      input.tid,
      this.userRepo,
      this.membershipRepo
    );

    const member = await this.membershipAdminRepo.find(
      input.targetUserId,
      input.workspaceId,
      input.tid
    );
    if (!member) {
      throw new DomainError('ERR_MEMBER_NOT_FOUND');
    }
    if (member.status === 'ACTIVE') return;

    await this.uow.runInTransaction(input.tid, async (tx) => {
      await this.membershipRepo.reactivate(
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
          action: 'REACTIVATED',
          beforeRole: member.role,
          afterRole: member.role,
          requestId: input.reqId ?? null,
        },
        input.tid,
        tx
      );
    });
  }
}
