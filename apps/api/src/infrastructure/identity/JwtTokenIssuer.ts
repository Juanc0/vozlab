import { randomUUID } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../shared/config/env.js';
import {
  ITokenIssuer,
  IssueAccessTokenInput,
  AccessToken,
} from '../../domain/ports/ITokenIssuer.js';

interface DecodedToken {
  exp?: number;
}

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
  private readonly secret: string;
  private readonly expiresIn: string;

  constructor(options: JwtTokenIssuerOptions = {}) {
    this.secret = options.secret ?? env.JWT_SECRET;
    this.expiresIn = options.expiresIn ?? env.JWT_EXPIRES_IN;
  }

  issue(input: IssueAccessTokenInput): AccessToken {
    const claims: Record<string, unknown> = {
      tid: input.tenantKey,
      jti: randomUUID(),
      authorHash: input.authorHash,
    };
    if (input.agentType) claims.type = input.agentType;

    const options: SignOptions = {
      algorithm: 'HS256',
      subject: input.userId,
      // env.ts validates the compact duration format at startup.
      expiresIn: this.expiresIn as SignOptions['expiresIn'],
    };

    const token = jwt.sign(claims, this.secret, options);
    const decoded = jwt.decode(token) as DecodedToken | null;

    if (!decoded?.exp) {
      throw new Error('Issued access token has no exp claim');
    }

    return {
      token,
      expiresAt: new Date(decoded.exp * 1000),
    };
  }
}
