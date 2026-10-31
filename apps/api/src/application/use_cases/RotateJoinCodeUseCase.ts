import { DomainError } from '../../domain/errors/DomainError.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import {
  IWorkspaceJoinCodeRepository,
  WorkspaceJoinCodeRecord,
} from '../../domain/ports/IWorkspaceJoinCodeRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';
import { IAuditLog } from '../../domain/ports/IAuditLog.js';
import { generateJoinCodeSecret } from './joinCodeSecret.js';

export interface RotateJoinCodeInput {
  actorUserId: string;
  /** ADR-0013 pseudonym of the actor — recorded as the new code's creator. */
  actorAuthorHash: string;
  tid: string;
  workspaceId: string;
}

/** The rotation answer: the new row plus its raw code, shown once. */
export interface RotateJoinCodeResult {
  id: string;
  code: string;
}

/**
 * Use Case: rotate the workspace's join credential (DEC-5 D3, ADR-0045).
 *
 * There is exactly one join-code mechanism now: the rotating, hashed
 * `auth.workspace_join_codes` row. Rotation revokes the workspace's most
 * recent non-revoked row and inserts a new one in the same transaction —
 * the old secret dies the instant the new one exists. A legacy workspace
 * without any live row simply gets one. The raw code appears only in this
 * answer: the stored hash is never readable back.
 */
export class RotateJoinCodeUseCase {
  constructor(
    private readonly codeRepo: IWorkspaceJoinCodeRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly userRepo: IUserRepository,
    private readonly uow: IUnitOfWork,
    private readonly audit?: IAuditLog
  ) {}

  async execute(input: RotateJoinCodeInput): Promise<RotateJoinCodeResult> {
    await assertWorkspaceAdmin(
      input.actorUserId,
      input.workspaceId,
      input.tid,
      this.userRepo,
      this.membershipRepo
    );

    const secret = generateJoinCodeSecret();

    const created = await this.uow.runInTransaction(input.tid, async (tx) => {
      // T4-M2: the current-row read runs INSIDE the transaction (same tx
      // handle), so a concurrent rotation cannot be missed and the
      // revoke+insert pair is serialized on the real state. The WORKSPACE
      // purpose filter runs in SQL (T8 carry-over): the rotation manages
      // workspace credentials only and never pulls the EVENT class across
      // the boundary.
      const rows = await this.codeRepo.list(
        input.workspaceId,
        input.tid,
        tx,
        'WORKSPACE'
      );
      const current = mostRecentActive(rows);
      if (current) {
        await this.codeRepo.revoke(current.id, input.tid, tx);
      }

      const fresh = await this.codeRepo.create(
        {
          workspaceId: input.workspaceId,
          codeHash: secret.codeHash,
          // The admin rotation manages WORKSPACE credentials only; an EVENT
          // row of the same workspace is a different credential class
          // (DEC-3) and is never inherited or replaced here.
          purpose: 'WORKSPACE',
          // The rotation inherits the attributes of the code it replaces;
          // a bare rotation must not silently change who gets auto-joined
          // or how many people the code admits. A past expiry would birth
          // a dead code, so only a live one carries over.
          label: current?.label ?? 'default',
          expiresAt:
            current?.expiresAt && current.expiresAt > new Date()
              ? current.expiresAt
              : null,
          maxUses: current?.maxUses ?? null,
          autoApprove: current?.autoApprove ?? false,
          createdByHash: input.actorAuthorHash,
        },
        input.tid,
        tx
      );
      return fresh;
    });

    await this.audit?.record({
      actorId: input.actorUserId,
      actorType: 'ADMIN',
      action: 'JOIN_CODE_ROTATED',
      targetType: 'join_code',
      targetId: created.id,
      tenantId: input.tid,
      metadata: { workspaceId: input.workspaceId },
    });
    return { id: created.id, code: secret.raw };
  }
}

/**
 * The workspace's most recent non-revoked row among the queried ones
 * (DEC-3: the EVENT class never reaches this query anymore — the purpose
 * filter runs in the SQL statement of `list`, T8 carry-over).
 */
function mostRecentActive(
  rows: WorkspaceJoinCodeRecord[]
): WorkspaceJoinCodeRecord | null {
  let best: WorkspaceJoinCodeRecord | null = null;
  for (const row of rows) {
    if (row.revokedAt !== null) continue;
    if (!best || row.createdAt > best.createdAt) best = row;
  }
  return best;
}
