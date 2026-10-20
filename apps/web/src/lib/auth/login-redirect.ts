/**
 * The redirect target of the institutional login.
 *
 * The target must be a path **on this origin**: the identity provider sends
 * the browser back to it, so an absolute URL or a protocol-relative path
 * would let it bounce the user to another site. `isSafeRedirectPath` (from
 * `@vozlab/shared-types`) is the single gate for that.
 *
 * The target is derived from where the user is, never hardcoded: the guard
 * sends the user to `/login?next=/proposals` and the login has to bring them
 * back to the proposal list.
 */

import { isSafeRedirectPath } from '@vozlab/shared-types';
import { DEFAULT_REDIRECT_PATH } from '$lib/api/auth';

/** The routes that must never be a redirect target. */
const AUTH_PATHS = new Set(['/login', '/join', '/auth/callback']);

/**
 * The path the browser has to come back to after the identity provider.
 *
 * - a `next` query parameter wins, but only when it is a safe path;
 * - otherwise the current path is used, unless it is one of the auth pages;
 * - otherwise the app root.
 */
export function loginRedirectPath(currentPath: string, next: string | null): string {
  if (next !== null && isSafeRedirectPath(next)) {
    return next;
  }

  if (isSafeRedirectPath(currentPath) && !AUTH_PATHS.has(currentPath)) {
    return currentPath;
  }

  return DEFAULT_REDIRECT_PATH;
}
