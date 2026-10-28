import { createHash, randomBytes } from 'node:crypto';
import type { WorkspaceRole } from '@vozlab/shared-types';
import { IInvitationAdminRepository } from '../../domain/ports/IInvitationAdminRepository.js';
import {
  IInvitationRepository,
  Invitation,
} from '../../domain/ports/IInvitationRepository.js';
import { IMembershipAdminRepository } from '../../domain/ports/IMembershipAdminRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { assertWorkspaceAdmin } from '../policies/workspaceAdminPolicy.js';

/** Short enough that a leaked link dies quickly, long enough to be usable. */
export const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;
/** An invitation link is single-use. */
export const INVITATION_MAX_USES = 1;

/** Normalized hash used to bind an invitation to an email without storing a lookup key. */
export function emailHashFor(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export interface CreateInvitationInput {
  actorUserId: string;
  tid: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  reqId?: string;
}

export interface CreateInvitationResult {
  invitation: Invitation;
  /** Raw token — returned once so the controller can build the link. */
  token: string;
}

/**
 * Use Case: create an email-bound invitation link (US-00).
 *
 * Creating a new invitation revokes the previous PENDING one for the same
 * email in the workspace: a re-send invalidates the old link instead of
 * leaving several live ways into the workspace. Only the hash of the token
 * is stored; the raw token exists once, in the answer.
 */
export class CreateInvitationUseCase {
  constructor(
    private readonly invitationRepo: IInvitationRepository,
    private readonly invitationAdminRepo: IInvitationAdminRepository,
    private readonly membershipAdminRepo: IMembershipAdminRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly userRepo: IUserRepository,
    private readonly uow: IUnitOfWork
  ) {}

  async execute(input: CreateInvitationInput): Promise<CreateInvitationResult> {
    await assertWorkspaceAdmin(
      input.actorUserId,
      input.workspaceId,
      input.tid,
      this.userRepo,
      this.membershipRepo
    );

    const email = input.email.trim().toLowerCase();
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const invitation = await this.uow.runInTransaction(input.tid, async (tx) => {
      await this.invitationAdminRepo.revokePendingForEmail(
        input.workspaceId,
        email,
        input.tid,
        tx
      );

      const created = await this.invitationRepo.create(
        {
          workspaceId: input.workspaceId,
          email,
          emailHash: emailHashFor(email),
          role: input.role,
          tokenHash,
          expiresAt,
          maxUses: INVITATION_MAX_USES,
          createdBy: input.actorUserId,
        },
        input.tid,
        tx
      );

      await this.membershipAdminRepo.recordEvent(
        {
          workspaceId: input.workspaceId,
          userId: null,
          invitationId: created.id,
          actorType: 'ADMIN',
          actorId: input.actorUserId,
          action: 'INVITED',
          afterRole: input.role,
          requestId: input.reqId ?? null,
        },
        input.tid,
        tx
      );

      return created;
    });

    return { invitation, token: rawToken };
  }
}
