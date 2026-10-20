/**
 * In-memory session state.
 *
 * The access token lives **only** in memory: the API returns it in the JSON
 * body of `/auth/refresh` (or `/auth/event-join`) and the refresh token is an
 * opaque `HttpOnly` cookie that JavaScript cannot read. Neither credential is
 * ever written to `localStorage` or `sessionStorage` — an XSS payload that
 * reaches this module still finds nothing to exfiltrate from storage.
 *
 * The instance is created per request on the server and per tab in the
 * browser; it is handed to the tree through the Svelte context API (see
 * `$lib/state/context`), never as a module-level singleton.
 */

import type { AuthSessionDto, AuthUserDto } from '@vozlab/shared-types';

export class SessionState {
  /** Short-lived HS256 access token. `null` when there is no session. */
  accessToken = $state<string | null>(null);

  /** ISO-8601 instant at which the access token expires. */
  expiresAt = $state<string | null>(null);

  /** The authenticated caller. `null` when there is no session. */
  user = $state<AuthUserDto | null>(null);

  /** `true` while an access token is held. */
  isAuthenticated = $derived(this.accessToken !== null);

  /** Adopts a session returned by the API. */
  setSession(session: AuthSessionDto): void {
    this.accessToken = session.accessToken;
    this.expiresAt = session.expiresAt;
    this.user = session.user;
  }

  /** Drops the session (logout, or a `401` from the API). */
  clear(): void {
    this.accessToken = null;
    this.expiresAt = null;
    this.user = null;
  }
}
