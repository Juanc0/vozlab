import { DomainError } from '../../domain/errors/DomainError.js';
import {
  IJoinRequestRepository,
  JoinRequestRecord,
  JoinRequestWithWorkspace,
} from '../../domain/ports/IJoinRequestRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IWorkspaceJoinCodeRepository } from '../../domain/ports/IWorkspaceJoinCodeRepository.js';
import {
  IWorkspaceRepository,
  WorkspaceRecord,
} from '../../domain/ports/IWorkspaceRepository.js';
import { IAuditLog } from '../../domain/ports/IAuditLog.js';
import { DbTransaction } from '../../domain/ports/Transaction.js';
import { hashOpaqueToken } from '../../shared/auth/refreshToken.js';

export interface RequestWorkspaceAccessInput {
  userId: string;
  tid: string;
  workspaceId?: string;
  code?: string;
  message?: string;
}

/**
 * Internal control flow (T4-M1): a PENDING request for this user+workspace
 * already existed, so the credential claim this transaction made must be
 * undone. Throwing unwinds `runInTransaction` — PostgreSQL rolls back the
 * `used_count` increment — and the caller maps the sentinel to the
 * today's-pending answer. Never crosses the use-case boundary.
 */
class PendingRequestExistsError extends Error {
  constructor(public readonly workspace: WorkspaceRecord) {
    super('pending join request already exists');
    this.name = 'PendingRequestExistsError';
  }
}

/**
 * Use Case: ask to enter a workspace (US-00).
 *
 * A public workspace can be asked for by id. A private one only through a
 * live join code: its existence is never confirmed to somebody who does not
 * hold the code. In both cases the answer is a PENDING request — a request
 * is a hint, never a grant.
 *
 * The code is the only workspace credential (DEC-5 D3, ADR-0045) and it is
 * redeemed with ONE conditional `UPDATE … RETURNING` (`consume`): purpose,
 * revocation, expiry and the use cap are enforced by the database, so
 * concurrent redemptions can never overbook `max_uses` (audit P4) and a
 * credential of the other class (EVENT, ADR-0046) can never redeem here.
 * The whole redemption — claim, decision, write — runs in one transaction:
 * anything that throws afterwards rolls the claim back, so a burned use
 * never charges for a failed join (T4-M1 extends this to the duplicate
 * PENDING case).
 */
export class RequestWorkspaceAccessUseCase {
  constructor(
    private readonly workspaceRepo: IWorkspaceRepository,
    private readonly joinRequestRepo: IJoinRequestRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly userRepo?: IUserRepository,
    private readonly codeRepo?: IWorkspaceJoinCodeRepository,
    private readonly audit?: IAuditLog,
    private readonly uow?: IUnitOfWork
  ) {
    // T4-M3: a wired code repository without a unit of work would silently
    // redeem OUTSIDE any transaction — a failed join would still burn a
    // use and the M1 rollback could not exist. Inconsistent wiring is a
    // composition-root bug: refuse it at construction, not at request time.
    if (codeRepo && !uow) {
      throw new Error(
        'RequestWorkspaceAccessUseCase requires a UnitOfWork when the join-code repository is wired'
      );
    }
  }

  async execute(
    input: RequestWorkspaceAccessInput
  ): Promise<JoinRequestWithWorkspace> {
    const code = input.code ?? '';
    if (code !== '') {
      return this.redeemCode(input, code);
    }

    let workspace: WorkspaceRecord | null = null;
    if (input.workspaceId !== undefined && input.workspaceId !== '') {
      workspace = await this.workspaceRepo.findById(
        input.workspaceId,
        input.tid
      );
      // A private workspace is only reachable with its code: by id it simply
      // does not exist for a user who is not already a member.
      if (workspace && !workspace.isPublic) {
        workspace = null;
      }
    }

    if (!workspace) {
      throw new DomainError('ERR_WORKSPACE_NOT_FOUND');
    }

    await this.assertNotGuest(input.userId, input.tid, workspace);
    return this.requestOrPending(input, workspace);
  }

  /**
   * The code path (P4 + M1): the WORKSPACE credential is claimed
   * atomically, then the returned row decides the flow — auto-approve
   * grants the membership, otherwise the code only ROUTED a PENDING
   * request here. The whole redemption runs in ONE transaction: a
   * duplicate pending request throws `PendingRequestExistsError`, the
   * rollback restores the claimed use, and the caller answers with the
   * request that already exists (T4-M1: a duplicate presentation never
   * burns a use, sequentially or under a concurrent race).
   */
  private async redeemCode(
    input: RequestWorkspaceAccessInput,
    code: string
  ): Promise<JoinRequestWithWorkspace> {
    const codeRepo = this.codeRepo;
    const uow = this.uow;
    if (!codeRepo || !uow) {
      throw new DomainError('ERR_WORKSPACE_NOT_FOUND');
    }
    const codeHash = hashOpaqueToken(code);

    const redeem = async (tx: DbTransaction) => {
      // Purpose guard (ADR-0046): an EVENT-class code can never redeem
      // here, whatever its hash — closes the P-3 leak.
      const consumed = await codeRepo.consume(
        codeHash,
        'WORKSPACE',
        input.tid,
        tx
      );
      if (!consumed) {
        // Unknown, revoked, expired or exhausted: one answer for all four,
        // so a failed redemption learns nothing about the code's state.
        throw new DomainError('ERR_WORKSPACE_NOT_FOUND');
      }

      const workspace = await this.workspaceRepo.findById(
        consumed.workspaceId,
        input.tid
      );
      if (!workspace) {
        throw new DomainError('ERR_WORKSPACE_NOT_FOUND');
      }

      await this.assertNotGuest(input.userId, input.tid, workspace);

      const role = await this.membershipRepo.getRole(
        input.userId,
        workspace.id,
        input.tid
      );
      if (role !== null) {
        throw new DomainError('ERR_ALREADY_MEMBER');
      }

      if (consumed.autoApprove) {
        await this.membershipRepo.add(
          input.userId,
          workspace.id,
          'MEMBER',
          input.tid,
          tx
        );
        await this.audit?.record({
          actorId: input.userId,
          actorType: 'USER',
          action: 'MEMBERSHIP_AUTO_APPROVED_BY_CODE',
          targetType: 'join_request',
          targetId: consumed.id,
          tenantId: input.tid,
          metadata: { workspaceId: workspace.id, userId: input.userId },
        });
        const pending = await this.joinRequestRepo.findPending(
          workspace.id,
          input.userId,
          input.tid
        );
        // Return a synthetic approved request.
        return {
          id: pending?.id ?? consumed.id,
          workspaceId: workspace.id,
          userId: input.userId,
          message: input.message ?? null,
          status: 'APPROVED',
          createdAt: new Date(),
          workspaceName: workspace.name,
        } as JoinRequestWithWorkspace;
      }

      return this.requestOrPending(input, workspace, tx, true);
    };

    try {
      return await uow.runInTransaction(input.tid, (tx) => redeem(tx));
    } catch (err) {
      if (err instanceof PendingRequestExistsError) {
        // The claim rolled back: answer with the pending request that won.
        const pending = await this.joinRequestRepo.findPending(
          err.workspace.id,
          input.userId,
          input.tid
        );
        if (pending) {
          return { ...pending, workspaceName: err.workspace.name };
        }
      }
      throw err;
    }
  }

  /** v6: GUEST (anonymous) cannot request access to non-EVENT workspaces. */
  private async assertNotGuest(
    userId: string,
    tid: string,
    workspace: WorkspaceRecord
  ): Promise<void> {
    if (!this.userRepo) return;
    const user = await this.userRepo.findById(userId, tid);
    if (user && user.provider === 'ANONYMOUS_EVENT' && workspace.kind !== 'EVENT') {
      throw new DomainError('ERR_AUTHORIZATION_FAILED');
    }
  }

  /**
   * Shared tail: an existing pending request is reused, never duplicated.
   * In `burnGuarded` mode (inside a redemption transaction, T4-M1) the
   * reuse decision is delegated to the partial-unique INSERT probe alone:
   * a pre-check return would COMMIT the claimed use for a request that
   * adds nothing, which is exactly the defect the guard forbids.
   */
  private async requestOrPending(
    input: RequestWorkspaceAccessInput,
    workspace: WorkspaceRecord,
    tx?: DbTransaction,
    burnGuarded = false
  ): Promise<JoinRequestWithWorkspace> {
    const role = await this.membershipRepo.getRole(
      input.userId,
      workspace.id,
      input.tid
    );
    if (role !== null) {
      throw new DomainError('ERR_ALREADY_MEMBER');
    }

    const insert = {
      workspaceId: workspace.id,
      userId: input.userId,
      message: input.message ?? null,
    };
    let created: JoinRequestRecord;
    if (burnGuarded) {
      // T4-M1: inside the redemption transaction a conflict must unwind the
      // whole transaction (the claimed use is restored), never fall back.
      const claimed = await this.joinRequestRepo.createIfAbsent(
        insert,
        input.tid,
        tx
      );
      if (!claimed) {
        throw new PendingRequestExistsError(workspace);
      }
      created = claimed;
    } else {
      const pending = await this.joinRequestRepo.findPending(
        workspace.id,
        input.userId,
        input.tid
      );
      if (pending) {
        return { ...pending, workspaceName: workspace.name };
      }
      created = await this.joinRequestRepo.create(insert, input.tid, tx);
    }

    await this.audit?.record({
      actorId: input.userId,
      actorType: 'USER',
      action: 'JOIN_REQUESTED',
      targetType: 'join_request',
      targetId: created.id,
      tenantId: input.tid,
      metadata: { workspaceId: workspace.id, userId: input.userId },
    });
    return { ...created, workspaceName: workspace.name };
  }
}
