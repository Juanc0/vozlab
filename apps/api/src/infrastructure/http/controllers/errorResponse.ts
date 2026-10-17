import { FastifyReply } from 'fastify';
import { ERROR_CODES, buildError } from '@vozlab/shared-types';
import { DomainError } from '../../../domain/errors/DomainError.js';

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
 * DOMAIN→HTTP guard: a domain code is only forwarded when it is a known
 * `ErrorCode` in the shared dictionary.
 */
function isErrorCode(code: string): code is ErrorCode {
  return Object.prototype.hasOwnProperty.call(ERROR_CODES, code);
}

/**
 * Domain-error → HTTP code mapping.
 *
 * Uses `instanceof DomainError` and the typed `error.code`; never parses the
 * message. Any non-domain (or unknown) error degrades to a 500.
 */
export function mapDomainError(error: unknown): ErrorCode {
  if (error instanceof DomainError && isErrorCode(error.code)) {
    return error.code;
  }
  return 'ERR_INTERNAL_SERVER_ERROR';
}
