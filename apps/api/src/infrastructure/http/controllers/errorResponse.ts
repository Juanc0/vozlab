import { FastifyReply } from 'fastify';
import { ERROR_CODES, buildError } from '@vozlab/shared-types';

export type ErrorCode = keyof typeof ERROR_CODES;

/**
 * Send a standardized error payload and return void (so controllers can
 * `return sendError(...)` from async handlers typed `Promise<void>`).
 */
export function sendError(
  reply: FastifyReply,
  code: ErrorCode,
  extra?: Record<string, unknown>
): void {
  const err = buildError(code);
  reply.status(err.status).send({ code: err.code, message: err.message, ...extra });
}

/**
 * Domain-error → HTTP code mapping. Domain/use cases throw `Error` whose
 * message starts with a stable `ERR_*` token.
 */
const DOMAIN_ERROR_CODES: ErrorCode[] = [
  'ERR_NODE_NOT_FOUND',
  'ERR_EDGE_NOT_FOUND',
  'ERR_THREAD_NOT_FOUND',
  'ERR_PROPOSAL_NOT_FOUND',
  'ERR_DUPLICATE_INTERACTION',
  'ERR_INVALID_RELATION_DOMAIN_RANGE',
  'ERR_INVALID_STATE_TRANSITION',
  'ERR_VALIDATION_FAILED',
];

export function mapDomainError(error: unknown): ErrorCode {
  const message = error instanceof Error ? error.message : '';
  const match = DOMAIN_ERROR_CODES.find((code) => message.includes(code));
  return match ?? 'ERR_INTERNAL_SERVER_ERROR';
}
