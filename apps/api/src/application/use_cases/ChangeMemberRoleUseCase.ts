import type { WorkspaceRole } from '@vozlab/shared-types';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IMembershipAdminRepository } from '../../domain/ports/IMembershipAdminRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { IWorkspaceRepository } from '../../domain/ports/IWorkspaceRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';

export interface ChangeMemberRoleInput {
  actorUserId: string;
  tid: string;
  workspaceId: string;
  targetUserId: string;
  role: WorkspaceRole;
  reqId?: string;
}

/**
 * Use Case: change the role of an active member.
 *
 * Demoting the last active ADMIN is refused: a workspace without one has no
 * way back into its own administration. The workspace row is locked first so
 * two concurrent demotions cannot both pass the count.
 */
export class ChangeMemberRoleUseCase {
  constructor(
    private readonly membershipAdminRepo: IMembershipAdminRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly workspaceRepo: IWorkspaceRepository,
    private readonly userRepo: IUserRepository,
    private readonly uow: IUnitOfWork
  ) {}

  async execute(input: ChangeMemberRoleInput): Promise<void> {
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
    if (!member || member.status !== 'ACTIVE') {
      throw new DomainError('ERR_MEMBER_NOT_FOUND');
    }
    if (member.role === input.role) return;

    const removingAdmin = member.role === 'ADMIN' && input.role !== 'ADMIN';

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
          beforeRole: member.role,
          afterRole: input.role,
          requestId: input.reqId ?? null,
        },
        input.tid,
        tx
      );
    });
  }
}
