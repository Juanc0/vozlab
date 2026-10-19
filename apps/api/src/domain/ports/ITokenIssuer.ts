import type { AgentType } from '@vozlab/shared-types';

export interface AccessToken {
  token: string;
  expiresAt: Date;
}

export interface IssueAccessTokenInput {
  /** Internal `auth.users.id` UUID (the JWT `sub`). */
  userId: string;
  /** Value stored in `tenants.oidc_tenant_id` and carried as the JWT `tid`. */
  tenantKey: string;
  /** Opaque pseudonym stored on `auth.users.author_hash`. */
  authorHash: string;
  /** Only for system agents; absent for humans. */
  agentType?: AgentType;
}

/**
 * Port: access-token issuance.
 *
 * The refresh credential is NOT a JWT; it is an opaque rotating token managed
 * by `IRefreshTokenRepository`. Keeping the two concerns separate prevents a
 * long-lived signed token from becoming a second, unrevocable access path.
 */
export interface ITokenIssuer {
  issue(input: IssueAccessTokenInput): AccessToken;
}
