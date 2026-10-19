/**
 * Port: external institutional identity provider (OIDC).
 *
 * The adapter owns the protocol details (authorization URL, PKCE, token
 * exchange, JWKS signature validation, nonce). It returns only the normalized
 * identity the application needs; no raw IdP token crosses this boundary.
 */
export interface OidcIdentity {
  /** Stable IdP subject (`sub`); stored as `auth.users.provider_user_id`. */
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  fullName: string | null;
  /**
   * Tenant discriminator from the validated ID token:
   *   - Entra ID: `tid` (directory/tenant GUID)
   *   - Google Workspace: `hd` (hosted domain)
   *
   * Matched against `tenants.oidc_tenant_id` in the router DB.
   */
  tenantKey: string;
}

export interface AuthorizationUrlInput {
  state: string;
  nonce: string;
  /** PKCE S256 challenge (base64url of SHA-256(verifier)). */
  codeChallenge: string;
}

export interface CodeExchangeInput {
  code: string;
  codeVerifier: string;
  /** Expected nonce from the authorization request; the ID token must match. */
  nonce: string;
}

export interface IIdentityProvider {
  buildAuthorizationUrl(input: AuthorizationUrlInput): string;
  exchangeCode(input: CodeExchangeInput): Promise<OidcIdentity>;
}
