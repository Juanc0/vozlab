import { randomBytes } from 'node:crypto';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IWorkspaceJoinCodeRepository } from '../../domain/ports/IWorkspaceJoinCodeRepository.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IAuditLog } from '../../domain/ports/IAuditLog.js';
import { hashOpaqueToken } from '../../shared/auth/refreshToken.js';

export interface CreateWorkspaceJoinCodeInput {
  actorUserId: string;
  tid: string;
  workspaceId: string;
  label?: string | null;
  expiresAt?: Date | null;
  maxUses?: number | null;
  autoApprove?: boolean;
}

export interface CreateWorkspaceJoinCodeResult {
  id: string;
  code: string; // raw, shown once
}

export class CreateWorkspaceJoinCodeUseCase {
  constructor(
    private readonly codeRepo: IWorkspaceJoinCodeRepository,
    private readonly userRepo: IUserRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly audit?: IAuditLog
  ) {}

  async execute(input: CreateWorkspaceJoinCodeInput): Promise<CreateWorkspaceJoinCodeResult> {
    await assertWorkspaceAdmin(input.actorUserId, input.workspaceId, input.tid, this.userRepo, this.membershipRepo);
    const raw = randomBytes(12).toString('hex').toUpperCase();
    const codeHash = hashOpaqueToken(raw);
    const record = await this.codeRepo.create(
      {
        workspaceId: input.workspaceId,
        codeHash,
        label: input.label ?? null,
        expiresAt: input.expiresAt ?? null,
        maxUses: input.maxUses ?? null,
        autoApprove: input.autoApprove ?? false,
        createdBy: input.actorUserId,
      },
      input.tid
    );
    // Never log the code itself — the hash's preimage stays only in the URL.
    await this.audit?.record({
      actorId: input.actorUserId,
      actorType: 'ADMIN',
      action: 'JOIN_CODE_CREATED',
      targetType: 'join_code',
      targetId: record.id,
      tenantId: input.tid,
      metadata: {
        workspaceId: input.workspaceId,
        label: record.label,
        autoApprove: record.autoApprove,
        maxUses: record.maxUses,
        expiresAt: record.expiresAt?.toISOString() ?? null,
      },
    });
    return { id: record.id, code: raw };
  }
}