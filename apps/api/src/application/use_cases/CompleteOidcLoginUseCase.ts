import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/errors/DomainError.js';
import {
  AuthUser,
  IUserRepository,
} from '../../domain/ports/IUserRepository.js';
import { IIdentityProvider } from '../../domain/ports/IIdentityProvider.js';
import type { WorkspaceRole } from '@vozlab/shared-types';
import { IOidcStateStore } from '../../domain/ports/IOidcStateStore.js';
import { IRouterDatabase } from '../../domain/ports/IRouterDatabase.js';
import { IGlobalUserRepository } from '../../domain/ports/IGlobalUserRepository.js';
import { IInvitationRepository } from '../../domain/ports/IInvitationRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
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
  refreshToken?: string;
  refreshExpiresAt?: Date;
  /** Absolute path on the PWA origin. */
  redirectPath: string;
  user?: AuthUser;
  /** v5: tenants linked to this identity. */
  linkedTenants: Array<{ id: string; slug: string; status: string }>;
  /** v6: global user id for tenant selection. */
  globalUserId?: string;
  /** v6: true when the user must select a tenant. */
  requiresTenantSelection: boolean;
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
    private readonly globalUserRepo: IGlobalUserRepository,
    private readonly userRepo: IUserRepository,
    private readonly invitationRepo: IInvitationRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly uow: IUnitOfWork,
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

    // D8: resolve or create global identity, upserting profile.
    const globalUser = await this.globalUserRepo.findOrCreate(
      identity.issuer,
      identity.subject,
      {
        email: identity.email,
        emailVerified: identity.emailVerified ?? false,
        fullName: identity.fullName,
        picture: null,
      }
    );

    const linkedTenants = await this.routerDb.findTenantsByGlobalUser(
      globalUser.id
    );

    // v6: explicit tenant selection. If multiple linked tenants, require selection.
    if (linkedTenants.length > 1) {
      return {
        redirectPath: state.redirectPath,
        linkedTenants: linkedTenants.map((t) => ({
          id: t.id,
          slug: t.slug,
          status: t.status,
        })),
        globalUserId: globalUser.id,
        requiresTenantSelection: true,
      };
    }

    // Resolve tenant: prefer linked tenant, else claims.
    let tenantId: string | null = null;
    if (linkedTenants.length === 1) {
      tenantId = linkedTenants[0].id;
    } else {
      const t = await this.routerDb.findTenantByOidcId(identity.tenantKey);
      tenantId = t?.id ?? null;
    }
    if (!tenantId) {
      throw new DomainError(
        'ERR_TENANT_NOT_PROVISIONED',
        `no tenant for claim ${identity.tenantKey}`
      );
    }
    const tenant = await this.routerDb.findTenantById(tenantId);
    if (!tenant) {
      throw new DomainError('ERR_TENANT_NOT_PROVISIONED');
    }

    const user = await this.userRepo.findOrCreateByExternalIdentity(
      {
        issuer: identity.issuer,
        subject: identity.subject,
        email: identity.email,
        emailVerified: identity.emailVerified,
        fullName: identity.fullName,
        authorHash: generateAuthorHash(),
        globalIdentityId: globalUser.id,
      },
      tenant.id
    );

    // D9: redeem the invitation carried by the OIDC state.
    //
    // Redemption is strict: the token must exist, be PENDING, unexpired and
    // unused, and the verified identity email must match the email the
    // invitation was bound to. A failure is an error — never a silent
    // "logged in without the membership" — so a broken link is visible.
    if (state.invitationToken) {
      const { createHash } = await import('node:crypto');
      const tokenHash = createHash('sha256')
        .update(state.invitationToken)
        .digest('hex');

      const invitation = await this.invitationRepo.findByTokenHash(
        tokenHash,
        tenant.id
      );

      const usable =
        invitation !== null &&
        invitation.status === 'PENDING' &&
        invitation.expiresAt > new Date() &&
        (invitation.maxUses === null ||
          invitation.usedCount < invitation.maxUses);
      const boundEmail = invitation?.email?.trim().toLowerCase() ?? null;
      const identityEmail = identity.email?.trim().toLowerCase() ?? null;
      const emailMatches =
        boundEmail !== null &&
        identity.emailVerified === true &&
        identityEmail !== null &&
        boundEmail === identityEmail;

      if (!invitation || !usable || !emailMatches) {
        throw new DomainError('ERR_INVITATION_INVALID');
      }

      await this.uow.runInTransaction(tenant.id, async (tx) => {
        // Conditional accept: the second concurrent callback loses the race
        // and must not create a second membership.
        const accepted = await this.invitationRepo.accept(
          invitation.id,
          tenant.id,
          tx
        );
        if (!accepted) {
          throw new DomainError('ERR_INVITATION_INVALID');
        }

        await this.membershipRepo.add(
          user.id,
          invitation.workspaceId,
          invitation.role as WorkspaceRole,
          tenant.id,
          tx
        );
      });
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

    const linked = await this.routerDb.findTenantsByGlobalUser(globalUser.id);

    return {
      refreshToken,
      refreshExpiresAt,
      redirectPath: state.redirectPath,
      user,
      linkedTenants: linked.map((t) => ({
        id: t.id,
        slug: t.slug,
        status: t.status,
      })),
      requiresTenantSelection: false,
    };
  }
}
