import { DomainError } from '../../domain/errors/DomainError.js';
import {
  IJoinRequestRepository,
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
 * Use Case: ask to enter a workspace (US-00).
 *
 * A public workspace can be asked for by id. A private one only through a
 * live join code: its existence is never confirmed to somebody who does not
 * hold the code. In both cases the answer is a PENDING request — a request
 * is a hint, never a grant.
 *
 * The code is the only workspace credential (DEC-5 D3, ADR-0045) and it is
 * redeemed with ONE conditional `UPDATE … RETURNING` (`consume`, the
 * `RouterDatabaseClient` template): revocation, expiry and the use cap are
 * enforced by the database, so concurrent redemptions can never overbook
 * `max_uses` (audit P4). The whole redemption — claim, decision, write —
 * runs in one transaction: anything that throws afterwards rolls the claim
 * back, so a burned use never charges for a failed join.
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
  ) {}

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
   * The code path (P4): the credential is claimed atomically, then the
   * returned row decides the flow — auto-approve grants the membership,
   * otherwise the code only ROUTED a PENDING request here.
   */
  private async redeemCode(
    input: RequestWorkspaceAccessInput,
    code: string
  ): Promise<JoinRequestWithWorkspace> {
    if (!this.codeRepo) {
      throw new DomainError('ERR_WORKSPACE_NOT_FOUND');
    }
    const codeHash = hashOpaqueToken(code);

    const redeem = async (tx?: DbTransaction) => {
      const consumed = await this.codeRepo!.consume(codeHash, input.tid, tx);
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

      return this.requestOrPending(input, workspace, tx);
    };

    if (this.uow) {
      return this.uow.runInTransaction(input.tid, (tx) => redeem(tx));
    }
    return redeem();
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

  /** Shared tail: an existing pending request is reused, never duplicated. */
  private async requestOrPending(
    input: RequestWorkspaceAccessInput,
    workspace: WorkspaceRecord,
    tx?: DbTransaction
  ): Promise<JoinRequestWithWorkspace> {
    const role = await this.membershipRepo.getRole(
      input.userId,
      workspace.id,
      input.tid
    );
    if (role !== null) {
      throw new DomainError('ERR_ALREADY_MEMBER');
    }

    const pending = await this.joinRequestRepo.findPending(
      workspace.id,
      input.userId,
      input.tid
    );
    if (pending) {
      return { ...pending, workspaceName: workspace.name };
    }

    const created = await this.joinRequestRepo.create(
      {
        workspaceId: workspace.id,
        userId: input.userId,
        message: input.message ?? null,
      },
      input.tid,
      tx
    );
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
