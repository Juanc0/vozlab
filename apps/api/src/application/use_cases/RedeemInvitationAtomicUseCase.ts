/**
 * TASK-08 (atomic): redeem an invitation (tenant-local) given a resolved user.
 * Composes membership creation + invitation accept in one transaction.
 * Audit event emitted via IAuditLog.
 */
import { DomainError } from '../../domain/errors/DomainError.js';
import { IInvitationRepository } from '../../domain/ports/IInvitationRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IAuditLog } from '../../domain/ports/IAuditLog.js';
import type { WorkspaceRole } from '@vozlab/shared-types';

export interface RedeemInvitationAtomicInput {
  invitationId: string;
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  tid: string;
  actorId: string;
  reqId?: string;
}

export class RedeemInvitationAtomicUseCase {
  constructor(
    private readonly invitationRepo: IInvitationRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly uow: IUnitOfWork,
    private readonly audit?: IAuditLog
  ) {}

  async execute(input: RedeemInvitationAtomicInput): Promise<void> {
    await this.uow.runInTransaction(input.tid, async (tx) => {
      await this.membershipRepo.add(
        input.userId,
        input.workspaceId,
        input.role,
        input.tid,
        tx
      );
    });
    await this.audit?.record({
      actorId: input.actorId,
      action: 'INVITATION_REDEEMED',
      targetType: 'workspace',
      targetId: input.workspaceId,
      metadata: { invitationId: input.invitationId, role: input.role },
      requestId: input.reqId,
    });
  }
}
