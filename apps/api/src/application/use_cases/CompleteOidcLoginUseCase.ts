import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/errors/DomainError.js';
import {
  AuthUser,
  IUserRepository,
} from '../../domain/ports/IUserRepository.js';
import { IIdentityProvider } from '../../domain/ports/IIdentityProvider.js';
import { IOidcStateStore } from '../../domain/ports/IOidcStateStore.js';
import { IRouterDatabase } from '../../domain/ports/IRouterDatabase.js';
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
    private readonly userRepo: IUserRepository,
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

    // If the login was started with a fixed institution, the IdP's tenant
    // claim must match. A mismatch means the user authenticated against a
    // different institution than requested.
    if (state.institution && identity.tenantKey !== state.institution) {
      throw new DomainError('ERR_TENANT_MISMATCH');
    }

    const tenant = await this.routerDb.findTenantByOidcId(identity.tenantKey);
    if (!tenant) {
      throw new DomainError(
        'ERR_TENANT_NOT_PROVISIONED',
        `no tenant for claim ${identity.tenantKey}`
      );
    }

    const user = await this.userRepo.findOrCreateOidcUser(
      {
        providerUserId: identity.providerUserId,
        email: identity.email,
        fullName: identity.fullName,
        authorHash: generateAuthorHash(),
        emailVerified: identity.emailVerified,
      },
      tenant.id
    );

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
