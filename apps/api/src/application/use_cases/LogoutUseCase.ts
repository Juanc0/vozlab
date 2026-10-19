import { ITokenBlacklist } from '../../domain/ports/ITokenBlacklist.js';
import { IRouterDatabase } from '../../domain/ports/IRouterDatabase.js';
import { IRefreshTokenRepository } from '../../domain/ports/IRefreshTokenRepository.js';
import { log } from '../../shared/logger/index.js';
import { hashOpaqueToken, parseRefreshToken } from '../../shared/auth/refreshToken.js';

export interface LogoutInput {
  /** Access-token id; present on tokens issued by the auth flow. */
  jti?: string;
  /** Access-token `exp`, in seconds since the epoch. */
  tokenExpiresAt?: number;
  /** Refresh cookie value, when the browser sent it. */
  refreshToken?: string;
}

/**
 * Revoke the access token for its remaining lifetime and revoke the refresh
 * family. Both operations are best-effort per dependency, but the controller
 * always clears the refresh cookie.
 */
export class LogoutUseCase {
  constructor(
    private readonly blacklist: ITokenBlacklist,
    private readonly routerDb: IRouterDatabase,
    private readonly refreshRepo: IRefreshTokenRepository
  ) {}

  async execute(input: LogoutInput): Promise<void> {
    if (input.jti && input.tokenExpiresAt) {
      const ttlSeconds = Math.max(
        0,
        input.tokenExpiresAt - Math.floor(Date.now() / 1000)
      );
      if (ttlSeconds > 0) {
        // Best-effort: a Redis outage must not prevent the refresh-family
        // revocation below. The access token is short-lived either way.
        try {
          await this.blacklist.revoke(input.jti, ttlSeconds);
        } catch (error) {
          log.error({ err: error, jti: input.jti }, 'failed to blacklist token');
        }
      }
    }

    if (!input.refreshToken) return;

    const parsed = parseRefreshToken(input.refreshToken);
    if (!parsed) return;

    const tenant = await this.routerDb.findTenantById(parsed.tenantId);
    if (!tenant) return;

    await this.refreshRepo.revokeFamilyByHash(
      hashOpaqueToken(input.refreshToken),
      parsed.tenantId
    );
  }
}
