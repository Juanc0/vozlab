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
import { IAuditLog } from '../../domain/ports/IAuditLog.js';
import { IRefreshTokenRepository } from '../../domain/ports/IRefreshTokenRepository.js';
import type { RedeemGlobalInvitationUseCase } from './RedeemGlobalInvitationUseCase.js';
import { RedeemInvitationAtomicUseCase } from './RedeemInvitationAtomicUseCase.js';
import {
  generateAuthorHash,
  generateRefreshToken,
  hashOpaqueToken,
} from '../../shared/auth/refreshToken.js';
import { deriveHandle } from '../../shared/auth/deriveHandle.js';

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
    private readonly refreshRepo: IRefreshTokenRepository,
    private readonly refreshTtlMs: number,
    /**
     * B12 (v5/TASK-08): the mutation of the tenant-local redemption is the
     * `RedeemInvitationAtomic` use case — conditional accept + membership
     * add in one transaction, audited after commit. This use case keeps the
     * strict validation (token, status, expiry, email binding) because a
     * broken invitation link must fail the login visibly, never silently.
     */
    private readonly redeemInvitation: RedeemInvitationAtomicUseCase,
    /**
     * v6/TASK-06: optional global-invitation redemption. When the OIDC state
     * carries a token that exists in the GLOBAL registry, redemption happens
     * before tenant resolution — the invited identity may have no tenant link
     * and no institutional claim for one.
     */
    private readonly redeemGlobalInvitation?: RedeemGlobalInvitationUseCase,
    /**
     * B12: identity trail. Every session issued by the callback records an
     * `OIDC_LOGIN` on the global identity (router DB, append-only).
     */
    private readonly audit?: IAuditLog
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

    // v6/TASK-06: a GLOBAL invitation is redeemed before tenant resolution.
    // The cross-IdP invitee has no tenant link yet and its institutional
    // claim maps to no tenant; the invitation itself carries the destination.
    if (state.invitationToken && this.redeemGlobalInvitation) {
      const isGlobal = await this.redeemGlobalInvitation.isGlobalToken(
        state.invitationToken
      );
      if (isGlobal) {
        const redeemed = await this.redeemGlobalInvitation.execute({
          token: state.invitationToken,
          globalUserId: globalUser.id,
          identityEmail: identity.email,
          identityEmailVerified: identity.emailVerified,
          issuer: identity.issuer,
          subject: identity.subject,
          fullName: identity.fullName,
        });
        return this.issueSession(
          redeemed.user,
          redeemed.tenantId,
          state.redirectPath,
          globalUser.id
        );
      }
    }

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
        // v6/TASK-03 (B14): the admin finds people by handle; the login is
        // the only place that knows the IdP profile, so the handle is
        // derived here and the adapter persists it (insert + repair).
        handle: deriveHandle(identity),
        globalIdentityId: globalUser.id,
      },
      tenant.id
    );

    // Keep the router link fresh for every institutional login, not just the
    // reconcile script: without it `findTenantsByGlobalUser` (the tenant
    // selector and `switch-tenant`) only ever sees manually reconciled rows.
    await this.routerDb.linkGlobalTenant(globalUser.id, tenant.id, user.id, 'ACTIVE');

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

      // B12: the mutation is the atomic use case — conditional accept +
      // membership add in one transaction, `INVITATION_REDEEMED` after commit.
      await this.redeemInvitation.execute({
        invitationId: invitation.id,
        userId: user.id,
        workspaceId: invitation.workspaceId,
        role: invitation.role as WorkspaceRole,
        tid: tenant.id,
        actorId: user.id,
      });
    }

    return this.issueSession(user, tenant.id, state.redirectPath, globalUser.id);
  }

  /**
   * Issue the refresh family and build the login result for a resolved
   * tenant session (shared by the institutional and the global-invitation
   * redemption paths).
   */
  private async issueSession(
    user: AuthUser,
    tenantId: string,
    redirectPath: string,
    globalUserId: string
  ): Promise<CompleteOidcLoginResult> {
    const refreshToken = generateRefreshToken(tenantId);
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs);

    await this.refreshRepo.create(
      {
        userId: user.id,
        familyId: randomUUID(),
        tokenHash: hashOpaqueToken(refreshToken),
        expiresAt: refreshExpiresAt,
      },
      tenantId
    );

    const linked = await this.routerDb.findTenantsByGlobalUser(globalUserId);

    // B12: explicit identity trail. Every session the callback issues —
    // institutional or global-invitation path — leaves one `OIDC_LOGIN` on
    // the global identity (router DB, append-only, no PII).
    await this.audit?.record({
      actorId: user.id,
      actorType: 'USER',
      action: 'OIDC_LOGIN',
      targetType: 'global_identity',
      targetId: globalUserId,
      tenantId,
      globalIdentityId: globalUserId,
      metadata: { redirectPath },
    });

    return {
      refreshToken,
      refreshExpiresAt,
      redirectPath,
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
