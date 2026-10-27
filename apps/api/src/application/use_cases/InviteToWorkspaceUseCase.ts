import { randomBytes, createHash } from 'node:crypto';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IInvitationRepository } from '../../domain/ports/IInvitationRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IRouterDatabase } from '../../domain/ports/IRouterDatabase.js';

export interface InviteToWorkspaceInput {
  workspaceId: string;
  email: string | null;
  role: string;
  createdBy: string;
  tid: string;
  ttlDays?: number;
}

export interface InviteToWorkspaceResult {
  invitationId: string;
  token: string;
  expiresAt: Date;
}

export class InviteToWorkspaceUseCase {
  constructor(
    private readonly invitationRepo: IInvitationRepository
  ) {}

  async execute(input: InviteToWorkspaceInput): Promise<InviteToWorkspaceResult> {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(
      Date.now() + (input.ttlDays ?? 7) * 24 * 60 * 60 * 1000
    );

    const invitation = await this.invitationRepo.create(
      {
        workspaceId: input.workspaceId,
        email: input.email,
        emailHash: input.email
          ? createHash('sha256').update(input.email.toLowerCase()).digest('hex')
          : null,
        role: input.role,
        tokenHash,
        expiresAt,
        createdBy: input.createdBy,
      },
      input.tid
    );

    return {
      invitationId: invitation.id,
      token: rawToken,
      expiresAt,
    };
  }
}