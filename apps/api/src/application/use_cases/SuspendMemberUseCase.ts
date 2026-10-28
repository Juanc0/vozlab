import { DomainError } from '../../domain/errors/DomainError.js';
import { IMembershipAdminRepository } from '../../domain/ports/IMembershipAdminRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { IWorkspaceRepository } from '../../domain/ports/IWorkspaceRepository.js';
import { IRefreshTokenRepository } from '../../domain/ports/IRefreshTokenRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';

export interface SuspendMemberInput {
  actorUserId: string;
  tid: string;
  workspaceId: string;
  targetUserId: string;
  reqId?: string;
}

/**
 * Use Case: suspend a membership.
 *
 * Suspension keeps the row (and its history) but drops the access: the guard
 * resolves roles only from ACTIVE memberships. An administrator cannot
 * suspend themselves, and the last active ADMIN cannot be suspended.
 */
export class SuspendMemberUseCase {
  constructor(
    private readonly membershipAdminRepo: IMembershipAdminRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly workspaceRepo: IWorkspaceRepository,
    private readonly userRepo: IUserRepository,
    private readonly uow: IUnitOfWork,
    private readonly refreshRepo?: IRefreshTokenRepository
  ) {}

  async execute(input: SuspendMemberInput): Promise<void> {
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
    if (member.status === 'SUSPENDED') return;

    const suspendingAdmin = member.role === 'ADMIN';

    await this.uow.runInTransaction(input.tid, async (tx) => {
      if (suspendingAdmin) {
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

      await this.membershipRepo.suspend(
        input.targetUserId,
        input.workspaceId,
        input.tid,
        tx
      );
      if (this.refreshRepo) {
        await this.refreshRepo.revokeAllForUser(input.targetUserId, input.tid);
      }
      await this.membershipAdminRepo.recordEvent(
        {
          workspaceId: input.workspaceId,
          userId: input.targetUserId,
          actorType: 'ADMIN',
          actorId: input.actorUserId,
          action: 'SUSPENDED',
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
