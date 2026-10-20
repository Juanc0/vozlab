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

import { isSafeRedirectPath, type AuthMeDto, type AuthSessionDto } from '@vozlab/shared-types';
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
