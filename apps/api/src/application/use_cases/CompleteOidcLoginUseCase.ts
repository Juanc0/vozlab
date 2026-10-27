import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/errors/DomainError.js';
import {
  AuthUser,
  IUserRepository,
} from '../../domain/ports/IUserRepository.js';
import { IIdentityProvider } from '../../domain/ports/IIdentityProvider.js';
import { IOidcStateStore } from '../../domain/ports/IOidcStateStore.js';
import { IRouterDatabase } from '../../domain/ports/IRouterDatabase.js';
import { IGlobalIdentityRepository } from '../../domain/ports/IGlobalIdentityRepository.js';
import { IInvitationRepository } from '../../domain/ports/IInvitationRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IRefreshTokenRepository } from '../../domain/ports/IRefreshTokenRepository.js';
import {
  generateAuthorHash,
  generateRefreshToken,
  hashOpaqueToken,
} from '../../shared/auth/refreshToken.js';

export interface CompleteOidcLoginInput {
  code: string;
  state: string;
}

export interface CompleteOidcLoginResult {
  refreshToken: string;
  refreshExpiresAt: Date;
  /** Absolute path on the PWA origin. */
  redirectPath: string;
  user: AuthUser;
}

/**
 * Redeem the OIDC callback and create (or link) the local account.
 *
 * First login is just-in-time: a user row is created with a random pseudonym,
 * but no workspace membership. Workspace routes still require an existing
 * membership (Team decision, Batch 1V).
 */
export class CompleteOidcLoginUseCase {
  constructor(
    private readonly stateStore: IOidcStateStore,
    private readonly identityProvider: IIdentityProvider,
    private readonly routerDb: IRouterDatabase,
    private readonly globalIdentityRepo: IGlobalIdentityRepository,
    private readonly userRepo: IUserRepository,
    private readonly invitationRepo: IInvitationRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly refreshRepo: IRefreshTokenRepository,
    private readonly refreshTtlMs: number
  ) {}

  async execute(
    input: CompleteOidcLoginInput
  ): Promise<CompleteOidcLoginResult> {
    const state = await this.stateStore.consume(input.state);
    if (!state) {
      throw new DomainError('ERR_INVALID_OIDC_STATE');
    }

    const identity = await this.identityProvider.exchangeCode({
      code: input.code,
      codeVerifier: state.codeVerifier,
      nonce: state.nonce,
    });

    if (identity.emailVerified === false) {
      throw new DomainError('ERR_EMAIL_NOT_VERIFIED');
    }

    // Resolve the tenant from the token claims (hd for Google Workspace,
    // tid for Entra ID, org ID for Zitadel native). The user does not
    // choose the institution — it is determined by the identity provider.
    const tenant = await this.routerDb.findTenantByOidcId(identity.tenantKey);
    if (!tenant) {
      throw new DomainError(
        'ERR_TENANT_NOT_PROVISIONED',
        `no tenant for claim ${identity.tenantKey}`
      );
    }

    // D8: resolve or create global identity.
    const globalIdentity = await this.globalIdentityRepo.findOrCreate(
      identity.issuer,
      identity.subject
    );

    const user = await this.userRepo.findOrCreateByExternalIdentity(
      {
        issuer: identity.issuer,
        subject: identity.subject,
        email: identity.email,
        emailVerified: identity.emailVerified,
        fullName: identity.fullName,
        authorHash: generateAuthorHash(),
        globalIdentityId: globalIdentity.id,
      },
      tenant.id
    );

    // D9: redeem invitation if token present in state.
    if (state.invitationToken) {
      const { createHash } = await import('node:crypto');
      const tokenHash = createHash('sha256')
        .update(state.invitationToken)
        .digest('hex');

      const invitation = await this.invitationRepo.findByTokenHash(
        tokenHash,
        tenant.id
      );

      if (invitation && invitation.status === 'PENDING' && invitation.expiresAt > new Date()) {
        // Validate email if invitation has email.
        let canRedeem = true;
        if (invitation.email && identity.emailVerified !== true) {
          canRedeem = false;
        }
        if (canRedeem && invitation.email && identity.email) {
          // Simple email comparison (normalized).
          if (invitation.email.toLowerCase() !== identity.email.toLowerCase()) {
            canRedeem = false;
          }
        }

        if (canRedeem) {
          // Create membership.
          await this.membershipRepo.add(
            user.id,
            invitation.workspaceId,
            invitation.role as any,
            tenant.id
          );
          // Mark invitation as accepted.
          await this.invitationRepo.accept(invitation.id, tenant.id);
        }
      }
    }

    const refreshToken = generateRefreshToken(tenant.id);
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs);

    await this.refreshRepo.create(
      {
        userId: user.id,
        familyId: randomUUID(),
        tokenHash: hashOpaqueToken(refreshToken),
        expiresAt: refreshExpiresAt,
      },
      tenant.id
    );

    return {
      refreshToken,
      refreshExpiresAt,
      redirectPath: state.redirectPath,
      user,
    };
  }
}
