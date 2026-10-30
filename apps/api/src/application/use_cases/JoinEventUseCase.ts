import { randomBytes, randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/errors/DomainError.js';
import { AuthUser, IUserRepository } from '../../domain/ports/IUserRepository.js';
import { ICredentialRouteRepository } from '../../domain/ports/ICredentialRouteRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IRouterDatabase } from '../../domain/ports/IRouterDatabase.js';
import { IRefreshTokenRepository } from '../../domain/ports/IRefreshTokenRepository.js';
import { ITokenIssuer } from '../../domain/ports/ITokenIssuer.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IWorkspaceJoinCodeRepository } from '../../domain/ports/IWorkspaceJoinCodeRepository.js';
import { IWorkspaceRepository } from '../../domain/ports/IWorkspaceRepository.js';
import {
  generateAuthorHash,
  generateRefreshToken,
  hashOpaqueToken,
} from '../../shared/auth/refreshToken.js';

export interface JoinEventInput {
  code: string;
  alias?: string;
}

export interface JoinEventResult {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthUser;
}

/**
 * Redeem an EVENT join code and create an anonymous workspace guest.
 *
 * Routing model (ADR-0046, audit §8.6): the raw code hashes to a thin
 * router-directory row (`credential_routes`, kind EVENT) that answers only
 * "which tenant?". The route NEVER authorizes — the AUTHORITY is the
 * tenant's `auth.workspace_join_codes` row, redeemed by one conditional
 * `consume(codeHash, 'EVENT')` (purpose + auto-approve + revocation +
 * expiry + capacity in a single statement) INSIDE the same tenant
 * transaction that creates the `ANONYMOUS_EVENT` user, the GUEST
 * membership and the refresh family. A route whose tenant credential is
 * missing, revoked, expired, exhausted or of the wrong purpose is a plain
 * 404 `ERR_EVENT_CODE_INVALID` — one answer for every failure state, so a
 * failed redemption learns nothing about the code. Because the claim and
 * the join share one transaction, a tenant-side failure can no longer
 * burn a use (the ADR-0019 trade-off is retired).
 */
export class JoinEventUseCase {
  constructor(
    private readonly credentialRoutes: ICredentialRouteRepository,
    private readonly routerDb: IRouterDatabase,
    private readonly joinCodeRepo: IWorkspaceJoinCodeRepository,
    private readonly workspaceRepo: IWorkspaceRepository,
    private readonly userRepo: IUserRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly refreshRepo: IRefreshTokenRepository,
    private readonly tokenIssuer: ITokenIssuer,
    private readonly uow: IUnitOfWork,
    private readonly refreshTtlMs: number
  ) {}

  async execute(input: JoinEventInput): Promise<JoinEventResult> {
    const codeHash = hashOpaqueToken(input.code);

    // L0: resolve the owning tenant through the directory. Kind-filtered so
    // a hash routed for another credential class never matches.
    const routedTenantId = await this.credentialRoutes.findTenantId(
      codeHash,
      'EVENT'
    );
    if (!routedTenantId) {
      throw new DomainError('ERR_EVENT_CODE_INVALID');
    }

    const tenant = await this.routerDb.findTenantById(routedTenantId);
    if (!tenant) {
      throw new DomainError('ERR_TENANT_NOT_PROVISIONED');
    }

    const alias =
      input.alias?.trim() || `Anonymous ${randomBytes(3).toString('hex')}`;
    const authorHash = generateAuthorHash();
    const refreshToken = generateRefreshToken(tenant.id);
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs);
    const familyId = randomUUID();

    const user = await this.uow.runInTransaction(tenant.id, async (tx) => {
      // L3 authority: the conditional redemption, inside this same
      // transaction. No row ⇒ unknown/revoked/expired/exhausted/wrong
      // purpose — all one 404, and the rollback leaves the counter intact.
      const consumed = await this.joinCodeRepo.consume(
        codeHash,
        'EVENT',
        tenant.id,
        tx
      );
      if (!consumed) {
        throw new DomainError('ERR_EVENT_CODE_INVALID');
      }

      // Defense in depth (mirrors the retired router-side guarantee): an
      // EVENT credential must point at an EVENT workspace.
      const workspace = await this.workspaceRepo.findById(
        consumed.workspaceId,
        tenant.id
      );
      if (!workspace || workspace.kind !== 'EVENT') {
        throw new DomainError('ERR_EVENT_CODE_INVALID');
      }

      const created = await this.userRepo.createAnonymousUser(
        { alias, authorHash },
        tenant.id,
        tx
      );

      await this.membershipRepo.add(
        created.id,
        consumed.workspaceId,
        'GUEST',
        tenant.id,
        tx
      );

      await this.refreshRepo.create(
        {
          userId: created.id,
          familyId,
          tokenHash: hashOpaqueToken(refreshToken),
          expiresAt: refreshExpiresAt,
        },
        tenant.id,
        tx
      );

      return created;
    });

    const access = this.tokenIssuer.issue({
      userId: user.id,
      tenantKey: tenant.oidcTenantId,
      authorHash: user.authorHash,
    });

    return {
      accessToken: access.token,
      accessExpiresAt: access.expiresAt,
      refreshToken,
      refreshExpiresAt,
      user,
    };
  }
}
