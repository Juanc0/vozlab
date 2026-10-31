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
import { ICredentialRouteRepository } from '../../domain/ports/ICredentialRouteRepository.js';
import { IAuditLog } from '../../domain/ports/IAuditLog.js';
import { IRefreshTokenRepository } from '../../domain/ports/IRefreshTokenRepository.js';
import { RedeemInvitationAtomicUseCase } from './RedeemInvitationAtomicUseCase.js';
import {
  generateAuthorHash,
  generateRefreshToken,
  hashEmail,
  hashOpaqueToken,
} from '../../shared/auth/refreshToken.js';
import { deriveHandle } from '../../shared/auth/deriveHandle.js';
import { log } from '../../shared/logger/index.js';

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
     * B12 (v5/TASK-08): the mutation of the redemption is the
     * `RedeemInvitationAtomic` use case — conditional accept + membership
     * add in one transaction, audited after commit. This use case keeps the
     * validation (token, status, expiry, email binding) because only a
     * VALID invitation may mutate state — but under DEC-9 a failed check
     * means "continue without redeeming", never a bricked login.
     */
    private readonly redeemInvitation: RedeemInvitationAtomicUseCase,
    /**
     * DEC-4: the HMAC key for the peppered email hash, injected by the
     * composition root (never read from the environment inside this layer).
     */
    private readonly emailPepper: string,
    /**
     * DEC-9 (audit §8.5): the thin L0 directory that answers "which tenant
     * owns this invitation token?" BEFORE any tenant is resolved. The old
     * two branches (global registry + strict tenant-local check) are ONE
     * path: route hit → that tenant is the destination for this hop.
     */
    private readonly credentialRoutes: ICredentialRouteRepository,
    /**
     * B12: identity trail. Every session issued by the callback records an
     * `OIDC_LOGIN` on the global user (router DB, append-only).
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

    // D8: resolve or create global user, upserting profile.
    // Audit P7.4: the IdP `picture` claim flows into the vault instead of
    // being hardcoded to null. `global_users.picture` is varchar(1024) —
    // truncate before storing, the same guard `deriveHandle` applies to the
    // handle column.
    // DEC-4: the vault stores the PEPPERED HASH of the asserted email, never
    // the cleartext — equality over the hash is all linking ever needs.
    const emailHash =
      identity.email !== null
        ? hashEmail(identity.email, this.emailPepper)
        : null;
    const globalUser = await this.globalUserRepo.findOrCreate(
      identity.issuer,
      identity.subject,
      {
        emailHash,
        emailVerified: identity.emailVerified ?? false,
        fullName: identity.fullName,
        picture: identity.picture ? identity.picture.slice(0, 1024) : null,
      }
    );

    // DEC-9 (audit §8.5): ONE redemption path for every invitation —
    // same-org and external invitees are the same flow. Runs BEFORE tenant
    // selection: the token IS the tenant selector for this hop. Redemption
    // is best-effort (ruling 7): a stale, revoked or mismatched link never
    // bricks the login — the invitation simply does not grant anything and
    // the ordinary resolution continues below.
    if (state.invitationToken) {
      const redeemed = await this.tryRedeemInvitation(
        state.invitationToken,
        identity,
        emailHash,
        globalUser.id
      );
      if (redeemed) {
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
        fullName: identity.fullName,
        authorHash: generateAuthorHash(),
        // v6/TASK-03 (B14): the admin finds people by handle; the login is
        // the only place that knows the IdP profile, so the handle is
        // derived here and the adapter persists it (insert + repair).
        handle: deriveHandle(identity),
        globalUserId: globalUser.id,
      },
      tenant.id
    );

    // Keep the router link fresh for every institutional login, not just the
    // reconcile script: without it `findTenantsByGlobalUser` (the tenant
    // selector and `switch-tenant`) only ever sees manually reconciled rows.
    await this.routerDb.linkGlobalUserTenant(globalUser.id, tenant.id, user.id, 'ACTIVE');

    return this.issueSession(user, tenant.id, state.redirectPath, globalUser.id);
  }

  /**
   * DEC-9 unified redemption (audit §8.5): hash → `credential_routes` →
   * open tenant → `findByTokenHash` → guards → email-bind → JIT user →
   * atomic accept + membership → router link LAST. Returns the session
   * target on success, `null` to mean "login continues WITHOUT redemption" —
   * an unroutable, revoked, expired, exhausted, email-mismatched or
   * race-lost invitation never fails the login itself (ruling 7; routing is
   * not authority, the tenant row is the gate) and never writes a link.
   */
  private async tryRedeemInvitation(
    token: string,
    identity: Awaited<ReturnType<IIdentityProvider['exchangeCode']>>,
    emailHash: string | null,
    globalUserId: string
  ): Promise<{ user: AuthUser; tenantId: string } | null> {
    const tokenHash = hashOpaqueToken(token);

    const routedTenantId = await this.credentialRoutes.findTenantId(
      tokenHash,
      'INVITATION'
    );
    if (!routedTenantId) {
      log.warn(
        { globalUserId },
        'invitation token carried in OIDC state is not routable — login continues without redemption'
      );
      return null;
    }

    const tenant = await this.routerDb.findTenantById(routedTenantId);
    if (!tenant) {
      log.warn(
        { routedTenantId, globalUserId },
        'invitation route points at a missing tenant — login continues without redemption'
      );
      return null;
    }

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
    // DEC-4 bind: the peppered hash of the verified email must equal the
    // hash the invitation was bound to — the cleartext never exists here.
    const emailMatches =
      invitation !== null &&
      invitation.emailHash !== null &&
      identity.emailVerified === true &&
      emailHash !== null &&
      invitation.emailHash === emailHash;

    if (!invitation || !usable || !emailMatches) {
      log.warn(
        { tenantId: tenant.id, invitationId: invitation?.id ?? null, globalUserId },
        'invitation not redeemable (revoked/expired/used or email mismatch) — login continues without redemption'
      );
      return null;
    }

    const user = await this.userRepo.findOrCreateByExternalIdentity(
      {
        issuer: identity.issuer,
        subject: identity.subject,
        fullName: identity.fullName,
        authorHash: generateAuthorHash(),
        // B14: the redeemed account gets its lookup alias from the IdP
        // assertion (in memory only — no email is ever stored).
        handle: deriveHandle(identity),
        globalUserId,
      },
      tenant.id
    );

    try {
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
    } catch (err) {
      if (err instanceof DomainError && err.code === 'ERR_INVITATION_INVALID') {
        // Lost the accept race (concurrent redemption) — the human still
        // logs in; the second grant simply never happens. NO router link is
        // written on this path: a link is only minted for a redemption that
        // actually granted membership, never for an inert invitation.
        log.warn(
          { tenantId: tenant.id, invitationId: invitation.id, globalUserId },
          'invitation accept race lost — login continues without redemption'
        );
        return null;
      }
      throw err;
    }

    // Router link LAST, only after the atomic grant committed (task-6 review,
    // MEDIUM-1): an invitation that never granted a membership must never
    // park the tenant in the picker or auto-select it. Accepted shape notes:
    // the atomic's own TX created user+membership, so between its commit and
    // this router write there is a brief window where another request's
    // `findTenantsByGlobalUser` does not yet see the tenant — harmless and
    // self-healing (this call is retried on every login, and the
    // institutional path refreshes the same link). If THIS write throws, the
    // membership exists without the link: the next login re-runs the
    // institutional path, which re-JITs the same user and re-links.
    await this.routerDb.linkGlobalUserTenant(globalUserId, tenant.id, user.id, 'ACTIVE');

    return { user, tenantId: tenant.id };
  }

  /**
   * Issue the refresh family and build the login result for a resolved
   * tenant session (shared by the institutional and the unified
   * invitation-redemption paths).
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
    // institutional or invitation-redeemed path — leaves one `OIDC_LOGIN` on
    // the global user (router DB, append-only, no PII).
    await this.audit?.record({
      actorId: user.id,
      actorType: 'USER',
      action: 'OIDC_LOGIN',
      targetType: 'global_identity',
      targetId: globalUserId,
      tenantId,
      globalUserId: globalUserId,
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
