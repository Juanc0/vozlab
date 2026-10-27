import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose';
import { env } from '../../shared/config/env.js';
import { log } from '../../shared/logger/index.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { InfrastructureError } from '../../domain/errors/InfrastructureError.js';
import {
  AuthorizationUrlInput,
  CodeExchangeInput,
  IIdentityProvider,
  OidcIdentity,
} from '../../domain/ports/IIdentityProvider.js';

export interface OidcProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  issuer: string;
  jwksUrl: string;
  scopes: string;
}

interface IdTokenClaims {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  nonce?: string;
  /** Entra ID tenant/directory id. */
  tid?: string;
  /** Google Workspace hosted domain. */
  hd?: string;
  /** Zitadel: user's organization ID (used as tenant key). */
  'urn:zitadel:iam:user:resourceowner:id'?: string;
}

interface TokenEndpointResponse {
  id_token?: string;
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface UserinfoResponse {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

export interface OidcProviderOptions {
  config?: OidcProviderConfig;
  fetchImpl?: typeof fetch;
  /** Injectable key resolver; tests pass a local key instead of remote JWKS. */
  jwks?: JWTVerifyGetKey;
}

function defaultConfig(): OidcProviderConfig {
  return {
    clientId: env.OIDC_CLIENT_ID,
    clientSecret: env.OIDC_CLIENT_SECRET,
    redirectUri: env.OIDC_REDIRECT_URI,
    authUrl: env.OIDC_AUTH_URL,
    tokenUrl: env.OIDC_TOKEN_URL,
    userinfoUrl: env.OIDC_USERINFO_URL,
    issuer: env.OIDC_ISSUER,
    jwksUrl: env.OIDC_JWKS_URL,
    scopes: env.OIDC_SCOPES,
  };
}

/**
 * OIDC authorization-code + PKCE adapter.
 *
 * Validation is deliberately strict: signature via JWKS, issuer, audience,
 * nonce and explicit `email_verified: false` rejection. The tenant key is the
 * validated `tid` (Entra) or `hd` (Google Workspace) claim; it is never taken
 * from the query string or a client-supplied header.
 */
export class OidcProviderClient implements IIdentityProvider {
  private readonly config: OidcProviderConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly jwks: JWTVerifyGetKey;

  constructor(options: OidcProviderOptions = {}) {
    this.config = options.config ?? defaultConfig();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.jwks =
      options.jwks ?? createRemoteJWKSet(new URL(this.config.jwksUrl));
  }

  buildAuthorizationUrl(input: AuthorizationUrlInput): string {
    const url = new URL(this.config.authUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('scope', this.config.scopes);
    url.searchParams.set('state', input.state);
    url.searchParams.set('nonce', input.nonce);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (input.kcIdpHint) {
      url.searchParams.set('kc_idp_hint', input.kcIdpHint);
    }
    return url.toString();
  }

  async exchangeCode(input: CodeExchangeInput): Promise<OidcIdentity> {
    const tokenResponse = await this.requestToken(input);
    if (!tokenResponse.id_token) {
      throw new DomainError(
        'ERR_OIDC_EXCHANGE_FAILED',
        'token endpoint returned no id_token'
      );
    }

    const claims = await this.verifyIdToken(tokenResponse.id_token, input.nonce);

    if (claims.email_verified === false) {
      throw new DomainError('ERR_EMAIL_NOT_VERIFIED');
    }

    // Priority: hd (Google Workspace hosted domain) first, then tid
    // (Entra ID tenant/directory), then Zitadel org ID (native users).
    const tenantKey =
      claims.hd ??
      claims.tid ??
      claims['urn:zitadel:iam:user:resourceowner:id'];
    if (!tenantKey || typeof tenantKey !== 'string') {
      throw new DomainError(
        'ERR_OIDC_EXCHANGE_FAILED',
        'ID token has neither a tid nor an hd claim'
      );
    }

    if (!claims.sub || typeof claims.sub !== 'string') {
      throw new DomainError('ERR_OIDC_EXCHANGE_FAILED', 'ID token has no sub');
    }

    let email = claims.email ?? null;
    let fullName = claims.name ?? null;
    // Distinguish "verified", "not verified" and "not asserted".
    // Absent claim → null (provider did not assert either way).
    let emailVerified: boolean | null =
      claims.email_verified === true
        ? true
        : claims.email_verified === false
          ? false
          : null;

    // Some providers omit profile claims from the ID token; userinfo is a
    // convenience, not an authority. A failure here never blocks login.
    if ((!email || !fullName) && tokenResponse.access_token) {
      const profile = await this.fetchUserinfo(tokenResponse.access_token);
      if (profile) {
        if (profile.sub && profile.sub !== claims.sub) {
          log.warn(
            { sub: claims.sub },
            'OIDC userinfo sub does not match ID token; ignoring profile'
          );
        } else {
          email = email ?? profile.email ?? null;
          fullName = fullName ?? profile.name ?? null;
          if (emailVerified === null && profile.email_verified !== undefined) {
            emailVerified = profile.email_verified === true;
          }
        }
      }
    }

    if (!emailVerified) {
      throw new DomainError('ERR_EMAIL_NOT_VERIFIED');
    }

    return {
      issuer: this.config.issuer,
      subject: claims.sub,
      providerUserId: claims.sub,
      email,
      emailVerified,
      fullName,
      tenantKey,
      providerKind: 'OIDC_INSTITUTIONAL',
    };
  }

  private async requestToken(
    input: CodeExchangeInput
  ): Promise<TokenEndpointResponse> {
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code_verifier: input.codeVerifier,
    });

    let response: Response;
    try {
      response = await this.fetchImpl(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: form.toString(),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      log.error({ err }, 'OIDC token endpoint unreachable');
      throw new InfrastructureError('ERR_OIDC_UNAVAILABLE');
    }

    const body = (await response.json().catch(() => ({}))) as TokenEndpointResponse;

    if (!response.ok) {
      log.warn(
        {
          status: response.status,
          error: body.error,
          errorDescription: body.error_description,
        },
        'OIDC token exchange rejected'
      );
      throw new DomainError(
        'ERR_OIDC_EXCHANGE_FAILED',
        `token endpoint returned HTTP ${response.status}`
      );
    }

    return body;
  }

  private async verifyIdToken(
    idToken: string,
    expectedNonce: string
  ): Promise<IdTokenClaims> {
    let payload: Record<string, unknown>;
    try {
      const verified = await jwtVerify(idToken, this.jwks, {
        issuer: this.config.issuer,
        audience: this.config.clientId,
        algorithms: ['RS256', 'PS256', 'ES256'],
        clockTolerance: 30,
      });
      payload = verified.payload as Record<string, unknown>;
    } catch (err) {
      log.warn({ err }, 'OIDC ID token validation failed');
      throw new DomainError('ERR_OIDC_EXCHANGE_FAILED', 'invalid ID token');
    }

    if (payload.nonce !== expectedNonce) {
      throw new DomainError('ERR_OIDC_EXCHANGE_FAILED', 'nonce mismatch');
    }

    return payload as IdTokenClaims;
  }

  private async fetchUserinfo(
    accessToken: string
  ): Promise<UserinfoResponse | null> {
    try {
      const response = await this.fetchImpl(this.config.userinfoUrl, {
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json',
        },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return null;
      return (await response.json()) as UserinfoResponse;
    } catch (err) {
      log.warn({ err }, 'OIDC userinfo request failed; continuing without it');
      return null;
    }
  }
}
