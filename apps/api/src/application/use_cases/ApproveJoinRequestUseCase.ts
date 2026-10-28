import type { WorkspaceRole } from '@vozlab/shared-types';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IJoinRequestRepository } from '../../domain/ports/IJoinRequestRepository.js';
import { IMembershipAdminRepository } from '../../domain/ports/IMembershipAdminRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';

export interface ApproveJoinRequestInput {
  actorUserId: string;
  tid: string;
  workspaceId: string;
  requestId: string;
  role: WorkspaceRole;
  reqId?: string;
}

/**
 * Use Case: approve a join request.
 *
 * The approval and the membership are one transaction: the request is
 * flipped to APPROVED and the user enters the workspace, or neither happens.
 * Approving twice is a conflict, not a second membership. A user who is
 * already an active member keeps their role; the approval never demotes.
 */
export class ApproveJoinRequestUseCase {
  constructor(
    private readonly joinRequestRepo: IJoinRequestRepository,
    private readonly membershipAdminRepo: IMembershipAdminRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly userRepo: IUserRepository,
    private readonly uow: IUnitOfWork
  ) {}

  async execute(input: ApproveJoinRequestInput): Promise<void> {
    await assertWorkspaceAdmin(
      input.actorUserId,
      input.workspaceId,
      input.tid,
      this.userRepo,
      this.membershipRepo
    );

    await this.uow.runInTransaction(input.tid, async (tx) => {
      const request = await this.joinRequestRepo.findById(
        input.requestId,
        input.workspaceId,
        input.tid,
        tx
      );
      if (!request) {
        throw new DomainError('ERR_JOIN_REQUEST_NOT_FOUND');
      }
      if (request.status !== 'PENDING') {
        throw new DomainError('ERR_JOIN_REQUEST_NOT_PENDING');
      }

      const decided = await this.joinRequestRepo.decide(
        input.requestId,
        'APPROVED',
        input.actorUserId,
        input.tid,
        tx
      );
      if (!decided) {
        throw new DomainError('ERR_JOIN_REQUEST_NOT_PENDING');
      }

      const existing = await this.membershipAdminRepo.find(
        request.userId,
        input.workspaceId,
        input.tid,
        tx
      );
      if (existing?.status !== 'ACTIVE') {
        await this.membershipAdminRepo.upsertMember(
          {
            userId: request.userId,
            workspaceId: input.workspaceId,
            role: input.role,
          },
          input.tid,
          tx
        );
      }

      await this.membershipAdminRepo.recordEvent(
        {
          workspaceId: input.workspaceId,
          userId: request.userId,
          actorType: 'ADMIN',
          actorId: input.actorUserId,
          action: 'JOIN_APPROVED',
          beforeRole: existing?.role ?? null,
          afterRole: existing?.status === 'ACTIVE' ? existing.role : input.role,
          requestId: input.reqId ?? null,
        },
        input.tid,
        tx
      );
    });
  }
}
