import { DomainError } from '../../domain/errors/DomainError.js';
import { IGlobalInvitationRepository } from '../../domain/ports/IGlobalInvitationRepository.js';
import { IGlobalUserRepository } from '../../domain/ports/IGlobalUserRepository.js';
import { IRouterDatabase } from '../../domain/ports/IRouterDatabase.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { hashOpaqueToken, generateAuthorHash } from '../../shared/auth/refreshToken.js';
import type { WorkspaceRole } from '@vozlab/shared-types';

export interface RedeemGlobalInvitationInput {
  token: string;
  globalUserId: string;
  identityEmail: string | null;
  identityEmailVerified: boolean | null;
  issuer: string;
  subject: string;
  fullName: string | null;
}

export interface RedeemGlobalInvitationResult {
  tenantId: string;
  workspaceId: string;
  role: WorkspaceRole;
  userId: string;
}

export class RedeemGlobalInvitationUseCase {
  constructor(
    private readonly globalInvitationRepo: IGlobalInvitationRepository,
    private readonly globalUserRepo: IGlobalUserRepository,
    private readonly routerDb: IRouterDatabase,
    private readonly userRepo: IUserRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly uow: IUnitOfWork
  ) {}

  async execute(input: RedeemGlobalInvitationInput): Promise<RedeemGlobalInvitationResult> {
    const tokenHash = hashOpaqueToken(input.token);
    const invitation = await this.globalInvitationRepo.findByTokenHash(tokenHash);
    if (!invitation) {
      throw new DomainError('ERR_INVITATION_INVALID');
    }
    const usable =
      invitation.status === 'PENDING' &&
      invitation.expiresAt > new Date() &&
      (invitation.maxUses === null || invitation.usedCount < invitation.maxUses);
    const boundEmail = invitation.email.trim().toLowerCase();
    const identityEmail = input.identityEmail?.trim().toLowerCase() ?? null;
    const emailMatches =
      input.identityEmailVerified === true &&
      identityEmail !== null &&
      boundEmail === identityEmail;
    if (!usable || !emailMatches) {
      throw new DomainError('ERR_INVITATION_INVALID');
    }

    const tenant = await this.routerDb.findTenantById(invitation.tenantId);
    if (!tenant) {
      throw new DomainError('ERR_TENANT_NOT_PROVISIONED');
    }

    const user = await this.userRepo.findOrCreateByExternalIdentity(
      {
        issuer: input.issuer,
        subject: input.subject,
        email: input.identityEmail,
        emailVerified: input.identityEmailVerified,
        fullName: input.fullName,
        authorHash: generateAuthorHash(),
        globalIdentityId: input.globalUserId,
      },
      tenant.id
    );

    const accepted = await this.globalInvitationRepo.accept(invitation.id);
    if (!accepted) {
      throw new DomainError('ERR_INVITATION_INVALID');
    }

    await this.uow.runInTransaction(tenant.id, async (tx) => {
      await this.membershipRepo.add(
        user.id,
        invitation.workspaceId,
        invitation.role as WorkspaceRole,
        tenant.id,
        tx
      );
    });

    return {
      tenantId: tenant.id,
      workspaceId: invitation.workspaceId,
      role: invitation.role as WorkspaceRole,
      userId: user.id,
    };
  }
}