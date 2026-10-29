/**
 * TASK-08 (atomic): add or remove one role of a member (v5/TASK-05 union rule).
 *
 * This is the single implementation behind the admin's role endpoints —
 * `AssignMemberRole` and `RemoveMemberRole` were folded into it (B12):
 * one operation, one transaction, one append-only `membership_events` row.
 *
 * Authorization and the last-admin rule live here, not in the controller, so
 * the endpoint can never drift from the rule. The write and its audit row
 * share the transaction: an event that did not happen is never recorded, and
 * a mutation is never left unaudited.
 */
import type { WorkspaceRole } from '@vozlab/shared-types';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IMembershipAdminRepository } from '../../domain/ports/IMembershipAdminRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { IWorkspaceRepository } from '../../domain/ports/IWorkspaceRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';

export interface ManageRoleAtomicInput {
  actorUserId: string;
  tid: string;
  workspaceId: string;
  targetUserId: string;
  role: WorkspaceRole;
  /** `true` grants the role (upsert), `false` removes exactly that role. */
  add: boolean;
  reqId?: string;
}

export class ManageRoleAtomicUseCase {
  constructor(
    private readonly membershipAdminRepo: IMembershipAdminRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly workspaceRepo: IWorkspaceRepository,
    private readonly userRepo: IUserRepository,
    private readonly uow: IUnitOfWork
  ) {}

  async execute(input: ManageRoleAtomicInput): Promise<void> {
    await assertWorkspaceAdmin(
      input.actorUserId,
      input.workspaceId,
      input.tid,
      this.userRepo,
      this.membershipRepo
    );

    // Granting a role presupposes the person exists in this tenant.
    if (input.add) {
      const user = await this.userRepo.findById(input.targetUserId, input.tid);
      if (!user) throw new DomainError('ERR_USER_NOT_FOUND');
    }

    // Removing the last ADMIN would lock the workspace out of its own admin.
    const removingAdmin = !input.add && input.role === 'ADMIN';

    await this.uow.runInTransaction(input.tid, async (tx) => {
      if (removingAdmin) {
        const workspace = await this.workspaceRepo.lockById(
          input.workspaceId,
          input.tid,
          tx
        );
        if (!workspace) throw new DomainError('ERR_WORKSPACE_NOT_FOUND');

        const admins = await this.membershipAdminRepo.countActiveAdmins(
          input.workspaceId,
          input.tid,
          tx
        );
        if (admins <= 1) {
          throw new DomainError('ERR_LAST_WORKSPACE_ADMIN');
        }
      }

      if (input.add) {
        await this.membershipAdminRepo.upsertMember(
          {
            userId: input.targetUserId,
            workspaceId: input.workspaceId,
            role: input.role,
          },
          input.tid,
          tx
        );
      } else {
        await this.membershipAdminRepo.removeRole(
          input.targetUserId,
          input.workspaceId,
          input.role,
          input.tid,
          tx
        );
      }

      await this.membershipAdminRepo.recordEvent(
        {
          workspaceId: input.workspaceId,
          userId: input.targetUserId,
          actorType: 'ADMIN',
          actorId: input.actorUserId,
          action: 'ROLE_CHANGED',
          beforeRole: input.add ? null : input.role,
          afterRole: input.add ? input.role : null,
          requestId: input.reqId ?? null,
        },
        input.tid,
        tx
      );
    });
  }
}
