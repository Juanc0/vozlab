/**
 * One-time OIDC authorization state.
 *
 * `consume` MUST be atomic (Redis GETDEL): a state value can be redeemed once.
 * Storing state server-side keeps the PKCE verifier and nonce out of the URL
 * and makes multi-tab login safe (each tab has its own state key).
 */
export interface OidcStateData {
  nonce: string;
  codeVerifier: string;
  /** Absolute path on the PWA origin to return to after login. */
  redirectPath: string;
  /** Optional institution slug requested at login time. */
  institution?: string;
  /** Optional invitation token (raw, single-use). */
  invitationToken?: string;
}

export interface IOidcStateStore {
  save(state: string, data: OidcStateData, ttlSeconds: number): Promise<void>;
  consume(state: string): Promise<OidcStateData | null>;
}
