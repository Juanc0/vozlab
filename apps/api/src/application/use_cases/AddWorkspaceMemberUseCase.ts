import type { WorkspaceRole } from '@vozlab/shared-types';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IMembershipAdminRepository } from '../../domain/ports/IMembershipAdminRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { ITenantAdminRepository } from '../../domain/ports/ITenantAdminRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';

export interface AddWorkspaceMemberInput {
  actorUserId: string;
  tid: string;
  workspaceId: string;
  email?: string;
  handle?: string;
  globalUserId?: string;
  role: WorkspaceRole;
  reqId?: string;
}

/**
 * Use Case: add an existing tenant user to a workspace directly (US-00).
 *
 * Direct add is for people who already signed in to the institution: the
 * email has to resolve to an `auth.users` row. Somebody who has never signed
 * in needs an invitation instead.
 *
 * A suspended or removed membership is revived with the requested role; an
 * active one is a conflict, not a silent overwrite.
 */
export class AddWorkspaceMemberUseCase {
  constructor(
    private readonly membershipAdminRepo: IMembershipAdminRepository,
    private readonly tenantAdminRepo: ITenantAdminRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly userRepo: IUserRepository,
    private readonly uow: IUnitOfWork
  ) {}

  async execute(input: AddWorkspaceMemberInput): Promise<void> {
    await assertWorkspaceAdmin(
      input.actorUserId,
      input.workspaceId,
      input.tid,
      this.userRepo,
      this.membershipRepo
    );

    let user: { id: string } | null = null;
    if (input.handle) {
      const found = await this.userRepo.findByHandle(input.handle, input.tid);
      user = found ? { id: found.id } : null;
    } else if (input.globalUserId) {
      // Resolve via global user → tenant user link not available; fall back to null (needs wiring).
      user = null;
    } else if (input.email) {
      user = await this.tenantAdminRepo.findUserByEmail(input.email, input.tid);
    }
    if (!user) {
      throw new DomainError('ERR_USER_NOT_FOUND');
    }

    const existing = await this.membershipAdminRepo.find(
      user.id,
      input.workspaceId,
      input.tid
    );
    if (existing?.status === 'ACTIVE') {
      throw new DomainError('ERR_ALREADY_MEMBER');
    }

    const action = existing ? 'REACTIVATED' : 'ADDED';

    await this.uow.runInTransaction(input.tid, async (tx) => {
      await this.membershipAdminRepo.upsertMember(
        {
          userId: user.id,
          workspaceId: input.workspaceId,
          role: input.role,
        },
        input.tid,
        tx
      );
      await this.membershipAdminRepo.recordEvent(
        {
          workspaceId: input.workspaceId,
          userId: user.id,
          actorType: 'ADMIN',
          actorId: input.actorUserId,
          action,
          beforeRole: existing?.role ?? null,
          afterRole: input.role,
          requestId: input.reqId ?? null,
        },
        input.tid,
        tx
      );
    });
  }
}
