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
  | 'ERR_EDGE_NOT_FOUND'
  | 'ERR_THREAD_NOT_FOUND'
  | 'ERR_PROPOSAL_NOT_FOUND'
  | 'ERR_TENANT_NOT_PROVISIONED'
  | 'ERR_DUPLICATE_INTERACTION'
  | 'ERR_INVALID_RELATION_DOMAIN_RANGE'
  | 'ERR_VALIDATION_FAILED'
  | 'ERR_AUTHORIZATION_FAILED';

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    detail?: string
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'DomainError';
  }
}
