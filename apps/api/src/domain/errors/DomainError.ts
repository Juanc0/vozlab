/**
 * Typed domain error.
 *
 * Carries a stable `DomainErrorCode` token so the HTTP layer can map a domain
 * failure to a status without parsing free-text messages. The domain owns this
 * vocabulary: no Fastify/Drizzle/pg imports and no HTTP status numbers here.
 */
export type DomainErrorCode =
  | 'ERR_INVALID_STATE_TRANSITION'
  | 'ERR_UNMET_AUTO_APPLY_CRITERIA'
  | 'ERR_NODE_NOT_FOUND'
  | 'ERR_NODE_NOT_EMBEDDED'
  | 'ERR_EDGE_NOT_FOUND'
  | 'ERR_THREAD_NOT_FOUND'
  | 'ERR_POST_NOT_FOUND'
  | 'ERR_PROPOSAL_NOT_FOUND'
  | 'ERR_DATA_SOURCE_NOT_FOUND'
  | 'ERR_TENANT_NOT_PROVISIONED'
  | 'ERR_TENANT_MISMATCH'
  | 'ERR_DUPLICATE_INTERACTION'
  | 'ERR_DUPLICATE_PROPOSAL'
  | 'ERR_INVALID_RELATION_DOMAIN_RANGE'
  | 'ERR_VALIDATION_FAILED'
  | 'ERR_AUTHORIZATION_FAILED'
  // --- Auth flow (ADR-0018) ---
  | 'ERR_INVALID_TOKEN'
  | 'ERR_REFRESH_TOKEN_INVALID'
  | 'ERR_INVALID_OIDC_STATE'
  | 'ERR_OIDC_EXCHANGE_FAILED'
  | 'ERR_EMAIL_NOT_VERIFIED'
  | 'ERR_ACCOUNT_LINK_CONFLICT'
  | 'ERR_EVENT_EXPIRED'
  | 'ERR_EVENT_FULL';

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    detail?: string
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'DomainError';
  }
}
