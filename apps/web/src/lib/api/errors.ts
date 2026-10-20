/**
 * The API error envelope.
 *
 * Every failing API call answers with `{ "code": "ERR_…", "message": "…" }`
 * (a `422` validation failure adds an `issues` array). The client turns that
 * envelope into an {@link ApiError} so the UI can show the API's own `code`
 * and `message` — never a raw HTTP status line.
 */

import { ERROR_CODES } from '@vozlab/shared-types';

/** A code that exists in the shared error dictionary. */
export type KnownErrorCode = keyof typeof ERROR_CODES;

/**
 * The error code of a failed call.
 *
 * Known codes keep their literal type (so `code === 'ERR_INVALID_TOKEN'`
 * narrows); an unknown code from the server degrades to `string`.
 */
export type ApiErrorCode = KnownErrorCode | (string & Record<never, never>);

/** A single validation issue (the `issues` array of a `422`). */
export interface ApiErrorIssue {
  /** Path of the offending field, e.g. `['title']`. */
  readonly path: ReadonlyArray<string | number>;
  /** Human-readable description of the problem. */
  readonly message: string;
  /** Machine-readable issue kind (e.g. `too_small`). */
  readonly code?: string;
}

/** Payload of the API error envelope. */
export interface ApiErrorPayload {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly issues?: readonly ApiErrorIssue[];
}

/**
 * Fallback code for a response that is **not** the API envelope (a proxy
 * error page, an empty body, a non-JSON body).
 *
 * It is not part of the shared dictionary on purpose: the dictionary has no
 * generic "unexpected response" entry, and inventing a per-resource code
 * (`ERR_NODE_NOT_FOUND` for a `404` on an edge route) would be a lie.
 */
export const UNEXPECTED_RESPONSE_CODE = 'ERR_UNEXPECTED_RESPONSE';

/** `true` when `code` is part of the shared error dictionary. */
export function isKnownErrorCode(code: string): code is KnownErrorCode {
  return Object.prototype.hasOwnProperty.call(ERROR_CODES, code);
}

/** The fallback code for a status that carries no envelope. */
export function fallbackCodeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 401:
      return 'ERR_INVALID_TOKEN';
    case 403:
      return 'ERR_AUTHORIZATION_FAILED';
    case 429:
      return 'ERR_RATE_LIMIT_EXCEEDED';
    default:
      if (status >= 500) {
        return 'ERR_INTERNAL_SERVER_ERROR';
      }
      return UNEXPECTED_RESPONSE_CODE;
  }
}

/** The fallback message for a status that carries no envelope. */
export function fallbackMessageForStatus(status: number): string {
  const code = fallbackCodeForStatus(status);
  if (!isKnownErrorCode(code)) {
    return `The API answered with an unexpected response (HTTP ${status}).`;
  }
  return ERROR_CODES[code].message;
}

/**
 * A failed API call.
 *
 * `status` is the HTTP status, `code` and `message` come from the API error
 * envelope. `issues` is only present on a `422` validation failure.
 */
export class ApiError extends Error {
  /** HTTP status of the failed call. */
  readonly status: number;

  /** The API error code (`ERR_…`). */
  readonly code: ApiErrorCode;

  /** The validation issues of a `422`, when the API sent them. */
  readonly issues: readonly ApiErrorIssue[];

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.status = payload.status;
    this.code = payload.code;
    this.issues = payload.issues ?? [];
    // Keeps `instanceof` working when the class is down-levelled.
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /** `true` for a `422` that carries validation issues. */
  get isValidationError(): boolean {
    return this.status === 422 && this.issues.length > 0;
  }

  /** Builds an error for a response that does not carry the envelope. */
  static fromStatus(status: number): ApiError {
    return new ApiError({
      status,
      code: fallbackCodeForStatus(status),
      message: fallbackMessageForStatus(status)
    });
  }
}

/** `true` when `value` is an {@link ApiError}. */
export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
