/**
 * Unified error code dictionary for VozLab API.
 * Avoids magic strings across the codebase.
 * Codes follow the pattern: ERR_<REASON>
 */

export const ERROR_CODES = {
  // --- Client / Request Errors (4xx) ---
  ERR_MISSING_WORKSPACE_HEADER: {
    status: 400,
    message: 'Header X-Workspace-ID is required for this request',
  },
  ERR_INVALID_WORKSPACE_HEADER: {
    status: 400,
    message: 'Header X-Workspace-ID must be a valid UUID',
  },
  ERR_INVALID_TOKEN: {
    status: 401,
    message: 'Invalid or malformed authentication token',
  },
  ERR_TOKEN_EXPIRED: {
    status: 401,
    message: 'Authentication token has expired',
  },
  ERR_TOKEN_BLACKLISTED: {
    status: 401,
    message: 'Token has been revoked (blacklisted)',
  },
  ERR_REFRESH_TOKEN_INVALID: {
    status: 401,
    message: 'Refresh token is invalid, expired or already rotated',
  },
  ERR_INVALID_OIDC_STATE: {
    status: 400,
    message: 'OIDC state is missing, invalid or expired',
  },
  ERR_OIDC_EXCHANGE_FAILED: {
    status: 502,
    message: 'Identity provider token exchange failed',
  },
  ERR_OIDC_UNAVAILABLE: {
    status: 503,
    message: 'Identity provider is unavailable',
  },
  ERR_EMAIL_NOT_VERIFIED: {
    status: 403,
    message: 'The identity provider has not verified this email address',
  },
  ERR_ACCOUNT_LINK_CONFLICT: {
    status: 409,
    message: 'An account with this email belongs to a different identity provider',
  },
  ERR_UNAUTHORIZED_WORKSPACE_ACCESS: {
    status: 403,
    message: 'User does not belong to the requested workspace',
  },
  ERR_AUTHORIZATION_FAILED: {
    status: 403,
    message: 'User is not authorized to perform this action',
  },
  ERR_TENANT_NOT_PROVISIONED: {
    status: 403,
    message: 'Tenant is not provisioned in the system',
  },
  ERR_EVENT_EXPIRED: {
    status: 400,
    message: 'Event code has expired or is invalid',
  },
  ERR_EVENT_FULL: {
    status: 400,
    message: 'Event has reached maximum capacity',
  },
  ERR_PROPOSAL_NOT_FOUND: {
    status: 404,
    message: 'Proposal not found',
  },
  ERR_DATA_SOURCE_NOT_FOUND: {
    status: 404,
    message: 'Data source not found',
  },
  ERR_NODE_NOT_FOUND: {
    status: 404,
    message: 'Node not found',
  },
  ERR_NODE_NOT_EMBEDDED: {
    status: 409,
    message: 'Node has no embedding yet',
  },
  ERR_EDGE_NOT_FOUND: {
    status: 404,
    message: 'Edge not found',
  },
  ERR_THREAD_NOT_FOUND: {
    status: 404,
    message: 'Discussion thread not found',
  },
  ERR_POST_NOT_FOUND: {
    status: 404,
    message: 'Discussion post not found',
  },
  ERR_DUPLICATE_INTERACTION: {
    status: 409,
    message: 'A vote already exists for this user and target',
  },
  ERR_DUPLICATE_PROPOSAL: {
    status: 409,
    message: 'A pending proposal already exists for this target',
  },
  ERR_INVALID_RELATION_DOMAIN_RANGE: {
    status: 422,
    message: 'Relation violates the ontology domain/range restrictions',
  },
  ERR_INVALID_STATE_TRANSITION: {
    status: 422,
    message: 'Invalid state transition for the entity',
  },
  ERR_UNMET_AUTO_APPLY_CRITERIA: {
    status: 422,
    message: 'Proposal does not meet the auto-apply criteria',
  },
  ERR_VALIDATION_FAILED: {
    status: 422,
    message: 'Validation failed for the request payload',
  },
  ERR_RATE_LIMIT_EXCEEDED: {
    status: 429,
    message: 'Rate limit exceeded, please try again later',
  },

  // --- Server Errors (5xx) ---
  ERR_INTERNAL_SERVER_ERROR: {
    status: 500,
    message: 'Internal server error',
  },
  ERR_DATABASE_CONNECTION_FAILED: {
    status: 503,
    message: 'Database connection failed',
  },
  ERR_REDIS_CONNECTION_FAILED: {
    status: 503,
    message: 'Redis connection failed',
  },
  ERR_LLM_UNAVAILABLE: {
    status: 503,
    message: 'LLM service is currently unavailable',
  },
  ERR_SERVICE_UNAVAILABLE: {
    status: 503,
    message: 'Service temporarily unavailable',
  },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/**
 * Helper to build a standardized error response payload.
 */
export function buildError(code: ErrorCode): {
  status: number;
  code: string;
  message: string;
} {
  const def = ERROR_CODES[code];
  if (!def) {
    return {
      status: 500,
      code: 'ERR_INTERNAL_SERVER_ERROR',
      message: ERROR_CODES.ERR_INTERNAL_SERVER_ERROR.message,
    };
  }
  return {
    status: def.status,
    code,
    message: def.message,
  };
}