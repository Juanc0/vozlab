import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { env } from '../../shared/config/env.js';
import {
  ITokenIssuer,
  IssueAccessTokenInput,
  AccessToken,
} from '../../domain/ports/ITokenIssuer.js';

export interface JwtTokenIssuerOptions {
  /** Defaults to `env.JWT_SECRET`; injectable for tests. */
  secret?: string;
  /** Defaults to `env.JWT_EXPIRES_IN`; injectable for tests. */
  expiresIn?: string;
}

/**
 * HS256 access-token issuer.
 *
 * The token carries exactly the claims `AuthGuard` enforces: `sub`, `tid`,
 * `jti`, `authorHash`, and `type` for agents. Refresh credentials are not JWTs
 * (see `IRefreshTokenRepository`).
 */
export class JwtTokenIssuer implements ITokenIssuer {
  private readonly secret: Uint8Array;
  private readonly expiresIn: string;

  constructor(options: JwtTokenIssuerOptions = {}) {
    this.secret = new TextEncoder().encode(options.secret ?? env.JWT_SECRET);
    this.expiresIn = options.expiresIn ?? env.JWT_EXPIRES_IN;
  }

  async issue(input: IssueAccessTokenInput): Promise<AccessToken> {
    const claims: Record<string, unknown> = {
      tid: input.tenantKey,
      jti: randomUUID(),
      authorHash: input.authorHash,
    };
    if (input.agentType) claims.type = input.agentType;

    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(input.userId)
      .setIssuedAt()
      .setExpirationTime(this.expiresIn)
      .sign(this.secret);

    // Decode the exp claim without re-verifying (we just signed it).
    const parts = token.split('.');
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8')
    ) as { exp?: number };

    if (!payload?.exp) {
      throw new Error('Issued access token has no exp claim');
    }

    return {
      token,
      expiresAt: new Date(payload.exp * 1000),
    };
  }
}