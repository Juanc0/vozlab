import { DomainError } from '../../domain/errors/DomainError.js';
import { AuthUser, IUserRepository } from '../../domain/ports/IUserRepository.js';
import { IRouterDatabase } from '../../domain/ports/IRouterDatabase.js';
import { IRefreshTokenRepository } from '../../domain/ports/IRefreshTokenRepository.js';
import { ITokenIssuer } from '../../domain/ports/ITokenIssuer.js';
import {
  generateRefreshToken,
  hashOpaqueToken,
  parseRefreshToken,
} from '../../shared/auth/refreshToken.js';

export interface RefreshSessionInput {
  refreshToken: string;
}

export interface RefreshSessionResult {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthUser;
}

/**
 * Rotate a refresh token and issue a new access token.
 *
 * Every successful refresh invalidates the presented token and returns a new
 * one in the same family. Reuse of an already-rotated token revokes the family
 * in the repository and surfaces as `401 ERR_REFRESH_TOKEN_INVALID`.
 */
export class RefreshSessionUseCase {
  constructor(
    private readonly routerDb: IRouterDatabase,
    private readonly userRepo: IUserRepository,
    private readonly refreshRepo: IRefreshTokenRepository,
    private readonly tokenIssuer: ITokenIssuer,
    private readonly refreshTtlMs: number
  ) {}

  async execute(input: RefreshSessionInput): Promise<RefreshSessionResult> {
    const parsed = parseRefreshToken(input.refreshToken);
    if (!parsed) {
      throw new DomainError('ERR_REFRESH_TOKEN_INVALID');
    }

    const tenant = await this.routerDb.findTenantById(parsed.tenantId);
    if (!tenant) {
      throw new DomainError('ERR_REFRESH_TOKEN_INVALID');
    }

    const newRefreshToken = generateRefreshToken(parsed.tenantId);
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs);

    const rotation = await this.refreshRepo.rotate(
      {
        oldTokenHash: hashOpaqueToken(input.refreshToken),
        newTokenHash: hashOpaqueToken(newRefreshToken),
        newExpiresAt: refreshExpiresAt,
      },
      parsed.tenantId
    );

    if (rotation.status !== 'OK') {
      throw new DomainError('ERR_REFRESH_TOKEN_INVALID');
    }

    const user = await this.userRepo.findById(rotation.userId, parsed.tenantId);
    if (!user || user.systemRole === 'SYSTEM_AGENT') {
      // Agents are minted out-of-band and never get a refresh session.
      throw new DomainError('ERR_REFRESH_TOKEN_INVALID');
    }

    // C7: if the user's sessions were revoked after this token was issued,
    // reject the refresh.
    if (
      user.sessionsValidAfter &&
      rotation.createdAt < user.sessionsValidAfter
    ) {
      throw new DomainError('ERR_REFRESH_TOKEN_INVALID');
    }

    const access = this.tokenIssuer.issue({
      userId: user.id,
      tenantKey: tenant.oidcTenantId,
      authorHash: user.authorHash,
    });

    return {
      accessToken: access.token,
      accessExpiresAt: access.expiresAt,
      refreshToken: newRefreshToken,
      refreshExpiresAt,
      user,
    };
  }
}
