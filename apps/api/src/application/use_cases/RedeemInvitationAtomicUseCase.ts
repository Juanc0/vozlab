/**
 * TASK-08 (atomic): redeem a tenant-local invitation for a resolved user.
 *
 * The mutation is one transaction: the conditional accept (a second
 * concurrent redemption loses the race and must not create a second
 * membership) and the membership add. Nothing else in the flow belongs
 * here — the token lookup, the expiry/use checks and the email binding are
 * the login's validation, performed before this atom is called.
 *
 * The `INVITATION_REDEEMED` audit event is emitted after the commit,
 * best-effort, like every other event (and carries the `tenantId` the
 * tenant-scoped store requires).
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
  /** Redeeming user, for the audit trail. */
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
      const accepted = await this.invitationRepo.accept(
        input.invitationId,
        input.tid,
        tx
      );
      if (!accepted) {
        throw new DomainError('ERR_INVITATION_INVALID');
      }

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
      actorType: 'USER',
      action: 'INVITATION_REDEEMED',
      targetType: 'workspace',
      targetId: input.workspaceId,
      tenantId: input.tid,
      metadata: { invitationId: input.invitationId, role: input.role },
      requestId: input.reqId,
    });
  }
}
