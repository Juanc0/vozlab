/**
 * The auth calls the API exposes.
 *
 * - `GET /auth/login` is a browser redirect to the identity provider: it is
 *   navigated to, never fetched.
 * - `POST /auth/refresh` authenticates with the `HttpOnly` refresh cookie
 *   alone — there is no `Authorization` header on that call.
 * - `GET /auth/me` is Bearer-protected and takes **no** workspace header:
 *   the workspace is the answer there, not an input.
 * - `POST /auth/logout` is Bearer-protected and clears the refresh cookie.
 */

import {
  isSafeRedirectPath,
  type AuthMeDto,
  type AuthSessionDto,
  type EventJoinInput
} from '@vozlab/shared-types';
import type { ApiClient } from './client';

/** Where the identity provider sends the browser back to by default. */
export const DEFAULT_REDIRECT_PATH = '/';

/**
 * The URL that starts the OIDC login.
 *
 * The redirect target must be a path on this origin: an absolute URL or a
 * protocol-relative path would let the identity provider bounce the user to
 * another site, so an unsafe value falls back to {@link DEFAULT_REDIRECT_PATH}.
 */
export function loginUrl(client: ApiClient, redirectPath: string = DEFAULT_REDIRECT_PATH): string {
  const safePath = isSafeRedirectPath(redirectPath) ? redirectPath : DEFAULT_REDIRECT_PATH;
  return client.url(`/auth/login?redirect=${encodeURIComponent(safePath)}`);
}

/**
 * Joins an event with its code (FR-03).
 *
 * The route is public and rate-limited per IP: the code is the credential, so
 * the call carries neither the `Authorization` nor the `X-Workspace-ID`
 * header. The answer is a full session — an access token plus the rotated
 * `HttpOnly` refresh cookie.
 */
export async function eventJoin(client: ApiClient, input: EventJoinInput): Promise<AuthSessionDto> {
  const code = input.code.trim();
  const alias = input.alias?.trim();

  const body: EventJoinInput = alias === undefined || alias === '' ? { code } : { code, alias };

  return client.request<AuthSessionDto>({
    method: 'POST',
    path: '/auth/event-join',
    auth: 'none',
    workspace: false,
    body
  });
}

/**
 * Exchanges the refresh cookie for a new access token.
 *
 * The API rotates the refresh cookie on every call; the browser stores the
 * new one, the access token stays in memory.
 */
export async function refreshSession(client: ApiClient): Promise<AuthSessionDto> {
  return client.request<AuthSessionDto>({
    method: 'POST',
    path: '/auth/refresh',
    auth: 'none',
    workspace: false
  });
}

/** The authenticated caller and the workspaces it is a member of. */
export async function fetchMe(client: ApiClient): Promise<AuthMeDto> {
  return client.request<AuthMeDto>({
    method: 'GET',
    path: '/auth/me',
    workspace: false
  });
}

/** Ends the session: the access token is blacklisted and the cookie cleared. */
export async function logout(client: ApiClient): Promise<void> {
  await client.requestVoid({
    method: 'POST',
    path: '/auth/logout',
    workspace: false
  });
}
