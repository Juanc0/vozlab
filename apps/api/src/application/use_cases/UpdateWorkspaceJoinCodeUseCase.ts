import { DomainError } from '../../domain/errors/DomainError.js';
import {
  IWorkspaceJoinCodeRepository,
  WorkspaceJoinCodeRecord,
} from '../../domain/ports/IWorkspaceJoinCodeRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';
import { IAuditLog } from '../../domain/ports/IAuditLog.js';

export interface UpdateWorkspaceJoinCodeInput {
  actorUserId: string;
  tid: string;
  workspaceId: string;
  codeId: string;
  /**
   * Only the attributes present are patched. The code secret itself is never
   * updated: rotating is a revoke + create (v6/TASK-04).
   */
  patch: {
    label?: string | null;
    expiresAt?: Date | null;
    maxUses?: number | null;
    autoApprove?: boolean;
  };
}

/**
 * Use Case: patch the mutable attributes of an ephemeral join code.
 *
 * The workspace is taken from the path and re-verified against the code row:
 * a code of another workspace simply does not exist here (404, never a leak
 * of which workspace owns it). A revoked code is frozen — re-activating it
 * would resurrect a secret that was withdrawn. The use of the cap is
 * checked against the uses already consumed.
 */
export class UpdateWorkspaceJoinCodeUseCase {
  constructor(
    private readonly codeRepo: IWorkspaceJoinCodeRepository,
    private readonly userRepo: IUserRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly audit?: IAuditLog
  ) {}

  async execute(
    input: UpdateWorkspaceJoinCodeInput
  ): Promise<WorkspaceJoinCodeRecord> {
    await assertWorkspaceAdmin(
      input.actorUserId,
      input.workspaceId,
      input.tid,
      this.userRepo,
      this.membershipRepo
    );

    const existing = await this.codeRepo.findById(input.codeId, input.tid);
    if (!existing || existing.workspaceId !== input.workspaceId) {
      throw new DomainError('ERR_JOIN_CODE_NOT_FOUND');
    }
    if (existing.revokedAt !== null) {
      throw new DomainError('ERR_VALIDATION_FAILED');
    }
    if (
      input.patch.maxUses !== undefined &&
      input.patch.maxUses !== null &&
      input.patch.maxUses < existing.usedCount
    ) {
      // The cap may not drop below what the code has already consumed.
      throw new DomainError('ERR_VALIDATION_FAILED');
    }

    const updated = await this.codeRepo.update(input.codeId, input.patch, input.tid);
    if (!updated) {
      throw new DomainError('ERR_JOIN_CODE_NOT_FOUND');
    }

    // Never log the code; the attributes patched are the audit payload.
    await this.audit?.record({
      actorId: input.actorUserId,
      actorType: 'ADMIN',
      action: 'JOIN_CODE_UPDATED',
      targetType: 'join_code',
      targetId: updated.id,
      tenantId: input.tid,
      metadata: {
        workspaceId: updated.workspaceId,
        label: updated.label,
        autoApprove: updated.autoApprove,
        maxUses: updated.maxUses,
        expiresAt: updated.expiresAt?.toISOString() ?? null,
      },
    });
    return updated;
  }
}
