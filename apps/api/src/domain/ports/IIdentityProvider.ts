/**
 * Port: external institutional identity provider (OIDC).
 *
 * The adapter owns the protocol details (authorization URL, PKCE, token
 * exchange, JWKS signature validation, nonce). It returns only the normalized
 * identity the application needs; no raw IdP token crosses this boundary.
 */
/**
 * Normalized external identity returned by any identity provider adapter
 * (OIDC today; SAML and LDAP in the future). The domain owns this type so
 * that the application layer never depends on a specific protocol.
 */
export interface ExternalIdentity {
  /** Issuer URL of the identity provider. */
  issuer: string;
  /** Stable IdP subject (`sub`); stored as `auth.users.provider_user_id`. */
  subject: string;
  /** Alias for `subject`; kept for backward compatibility. */
  providerUserId: string;
  email: string | null;
  /** `true` = verified, `false` = explicitly unverified, `null` = not asserted. */
  emailVerified: boolean | null;
  fullName: string | null;
  /**
   * Tenant discriminator from the validated ID token:
   *   - Entra ID: `tid` (directory/tenant GUID)
   *   - Google Workspace: `hd` (hosted domain)
   *   - Zitadel: `urn:zitadel:iam:user:resourceowner:id`
   *
   * Matched against `tenants.oidc_tenant_id` in the router DB.
   */
  tenantKey: string;
  /** Provider kind for storage in `auth.external_identities`. */
  providerKind: 'OIDC_INSTITUTIONAL' | 'ANONYMOUS_EVENT';
}

/** Backward-compatible alias for the OIDC adapter. */
export type OidcIdentity = ExternalIdentity;

export interface AuthorizationUrlInput {
  state: string;
  nonce: string;
  /** PKCE S256 challenge (base64url of SHA-256(verifier)). */
  codeChallenge: string;
  /** Optional IdP hint for the broker (kc_idp_hint). */
  kcIdpHint?: string;
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
