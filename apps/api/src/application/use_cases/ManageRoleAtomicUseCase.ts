import { DomainError } from '../../domain/errors/DomainError.js';
import { IMembershipAdminRepository } from '../../domain/ports/IMembershipAdminRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IAuditLog } from '../../domain/ports/IAuditLog.js';
import type { WorkspaceRole } from '@vozlab/shared-types';

export interface ManageRoleAtomicInput {
  actorUserId: string;
  tid: string;
  workspaceId: string;
  targetUserId: string;
  role: WorkspaceRole;
  add: boolean; // true add, false remove
  reqId?: string;
}

export class ManageRoleAtomicUseCase {
  constructor(
    private readonly membershipAdminRepo: IMembershipAdminRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly uow: IUnitOfWork,
    private readonly audit?: IAuditLog
  ) {}

  async execute(input: ManageRoleAtomicInput): Promise<void> {
    await this.uow.runInTransaction(input.tid, async (tx) => {
      if (input.add) {
        await this.membershipAdminRepo.upsertMember(
          { userId: input.targetUserId, workspaceId: input.workspaceId, role: input.role },
          input.tid,
          tx
        );
      } else {
        await this.membershipRepo.remove(input.targetUserId, input.workspaceId, input.tid, tx);
      }
    });
    await this.audit?.record({
      actorId: input.actorUserId,
      action: input.add ? 'ROLE_ADDED' : 'ROLE_REMOVED',
      targetType: 'workspace',
      targetId: input.workspaceId,
      metadata: { targetUserId: input.targetUserId, role: input.role },
      requestId: input.reqId,
    });
  }
}