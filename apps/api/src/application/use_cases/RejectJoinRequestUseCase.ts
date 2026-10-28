import { DomainError } from '../../domain/errors/DomainError.js';
import { IJoinRequestRepository } from '../../domain/ports/IJoinRequestRepository.js';
import { IMembershipAdminRepository } from '../../domain/ports/IMembershipAdminRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';

export interface RejectJoinRequestInput {
  actorUserId: string;
  tid: string;
  workspaceId: string;
  requestId: string;
  reqId?: string;
}

/** Use Case: reject a join request (a hint was denied; no membership exists). */
export class RejectJoinRequestUseCase {
  constructor(
    private readonly joinRequestRepo: IJoinRequestRepository,
    private readonly membershipAdminRepo: IMembershipAdminRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly userRepo: IUserRepository,
    private readonly uow: IUnitOfWork
  ) {}

  async execute(input: RejectJoinRequestInput): Promise<void> {
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
        'REJECTED',
        input.actorUserId,
        input.tid,
        tx
      );
      if (!decided) {
        throw new DomainError('ERR_JOIN_REQUEST_NOT_PENDING');
      }

      await this.membershipAdminRepo.recordEvent(
        {
          workspaceId: input.workspaceId,
          userId: request.userId,
          actorType: 'ADMIN',
          actorId: input.actorUserId,
          action: 'JOIN_REJECTED',
          requestId: input.reqId ?? null,
        },
        input.tid,
        tx
      );
    });
  }
}
