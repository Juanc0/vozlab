/**
 * The description of a failed call.
 *
 * The API answers with an envelope (`{ code, message }`); the UI shows that
 * envelope rather than the raw HTTP text. A failure that is not an envelope
 * (a proxy error page, a network failure) gets a generic code and the
 * message of the exception — never a status line.
 */

import type { Translate } from '$lib/i18n';
import { UNEXPECTED_RESPONSE_CODE, isApiError, isOfflineError } from './errors';

/** The code and the message of a failed call, ready to be shown. */
export interface ApiFailure {
  /** The API error code (`ERR_…`). */
  readonly code: string;
  /** The human-readable message. */
  readonly message: string;
}

/**
 * Describes a failed call.
 *
 * The translator is **optional**: without it the messages of the client
 * itself keep their default (the English ones). The messages the **API**
 * sends are never translated: they are the contract of the API, and the
 * code is what identifies them.
 */
export function describeFailure(caught: unknown, t?: Translate): ApiFailure {
  if (isApiError(caught)) {
    return { code: caught.code, message: caught.message };
  }

  if (isOfflineError(caught)) {
    // The request never left the app: the code says so, and the message
    // explains what the user can and cannot do.
    return { code: caught.code, message: t?.('errors.offline') ?? caught.message };
  }

  return {
    code: UNEXPECTED_RESPONSE_CODE,
    message: caught instanceof Error ? caught.message : (t?.('errors.unexpected') ?? 'The request failed.')
  };
}
