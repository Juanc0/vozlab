import { IWorkspaceJoinCodeRepository } from '../../domain/ports/IWorkspaceJoinCodeRepository.js';
import { JoinCodePurpose } from '../../domain/ports/IWorkspaceJoinCodeRepository.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IAuditLog } from '../../domain/ports/IAuditLog.js';
import { IWorkspaceRepository } from '../../domain/ports/IWorkspaceRepository.js';
import { ICredentialRouteRepository } from '../../domain/ports/ICredentialRouteRepository.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { generateJoinCodeSecret } from './joinCodeSecret.js';

export interface CreateWorkspaceJoinCodeInput {
  actorUserId: string;
  /** ADR-0013 pseudonym of the actor — recorded as the code's creator. */
  actorAuthorHash: string;
  tid: string;
  workspaceId: string;
  purpose?: JoinCodePurpose;
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
    private readonly audit?: IAuditLog,
    private readonly workspaceRepo?: IWorkspaceRepository,
    private readonly routerDb?: ICredentialRouteRepository
  ) {}

  async execute(input: CreateWorkspaceJoinCodeInput): Promise<CreateWorkspaceJoinCodeResult> {
    await assertWorkspaceAdmin(input.actorUserId, input.workspaceId, input.tid, this.userRepo, this.membershipRepo);

    const purpose: JoinCodePurpose = input.purpose ?? 'WORKSPACE';

    // EVENT codes are only valid for EVENT workspaces and are always
    // auto-approving (DEC-3).
    let autoApprove = input.autoApprove ?? false;
    if (purpose === 'EVENT') {
      if (!this.workspaceRepo) {
        throw new DomainError('ERR_VALIDATION_FAILED');
      }
      const workspace = await this.workspaceRepo.findById(input.workspaceId, input.tid);
      if (!workspace || (workspace as { kind?: string }).kind !== 'EVENT') {
        throw new DomainError('ERR_VALIDATION_FAILED');
      }
      autoApprove = true;
    }

    const secret = generateJoinCodeSecret();
    const record = await this.codeRepo.create(
      {
        workspaceId: input.workspaceId,
        codeHash: secret.codeHash,
        purpose,
        label: input.label ?? null,
        expiresAt: input.expiresAt ?? null,
        maxUses: input.maxUses ?? null,
        autoApprove,
        createdByHash: input.actorAuthorHash,
      },
      input.tid
    );

    // Tenant authority row first; the router directory row follows so the
    // pre-tenant join path resolves (ADR-0046, tenant-first ordering).
    if (purpose === 'EVENT' && this.routerDb) {
      await this.routerDb.ensureRoute(secret.codeHash, 'EVENT', input.tid);
    }

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
        purpose,
        label: record.label,
        autoApprove: record.autoApprove,
        maxUses: record.maxUses,
        expiresAt: record.expiresAt?.toISOString() ?? null,
      },
    });
    return { id: record.id, code: secret.raw };
  }
}