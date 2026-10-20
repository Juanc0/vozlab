/**
 * The development sign-in.
 *
 * The event-code join grants the `MEMBER` role, and a member can neither
 * approve a proposal nor auto-apply one: the approval belongs to the
 * **author of the target**, and the auto-apply to a moderator. The demo
 * graph is authored by the maintainer, so a presenter who signed in with an
 * event code could look at the governance screens but never act on them.
 *
 * `db:mint-token` already mints a token for each of the dev identities, and
 * the API accepts it as a bearer token. This module lets the browser adopt
 * one of those tokens as its session, so the presenter can act as the
 * maintainer in the app itself.
 *
 * **This is a development tool and it never ships.** The panel that uses it
 * is rendered only in a dev build (`import { dev } from '$app/environment'`),
 * and the token is kept in the in-memory session state like any other access
 * token: it is never written to `localStorage` or `sessionStorage`.
 *
 * The token is not verified here. The client decodes its payload only to
 * show when it expires; the **API is the authority** — a token that is
 * expired, forged or revoked is rejected by `GET /auth/me` with a `401`.
 */

import type { ApiError } from '$lib/api/errors';
import { isDevelopmentBuild } from '$lib/config/environment';
import type { WorkspaceSummaryDto } from '@vozlab/shared-types';
import { loadMemberships, type SessionRestoreDeps } from './restore';

/**
 * Where the development token is kept between reloads.
 *
 * The key is namespaced and the whole path is dead outside a development
 * build: `isDevelopmentBuild()` is a constant `false` in a production
 * bundle, so the code that writes here is never reached there.
 */
const DEV_TOKEN_STORAGE_KEY = 'vozlab_dev_token';

/** What the development sign-in found. */
export type DevSignInStatus =
  /** The token was accepted and the session is live. */
  | 'signed-in'
  /** The text is not a bearer token at all. */
  | 'invalid-token'
  /** The API rejected the token: expired, revoked or not valid. */
  | 'rejected'
  /** The API could not be reached. */
  | 'failed';

/** The result of a development sign-in. */
export interface DevSignInOutcome {
  readonly status: DevSignInStatus;
  /** The memberships of the identity; empty unless the sign-in worked. */
  readonly workspaces: readonly WorkspaceSummaryDto[];
  /** The API error, when there was one. */
  readonly error: ApiError | null;
}

/**
 * How long a token is assumed to live when its payload cannot be read.
 *
 * The API's default access-token lifetime is 15 minutes. The value is only
 * shown in the interface; the API decides when the token actually stops
 * working.
 */
const ASSUMED_TOKEN_LIFETIME_MS = 15 * 60 * 1000;

/**
 * Adopts a development token as the session of this tab.
 *
 * The token is put in the session state before the call that proves it, so
 * the client sends it as the bearer; the API's answer is what decides
 * whether it is kept.
 */
export async function signInWithDevelopmentToken(
  deps: SessionRestoreDeps,
  token: string
): Promise<DevSignInOutcome> {
  const accessToken = token.trim();

  if (!looksLikeBearerToken(accessToken)) {
    return { status: 'invalid-token', workspaces: [], error: null };
  }

  deps.session.accessToken = accessToken;
  deps.session.expiresAt = expiryOf(accessToken);

  const outcome = await loadMemberships(deps);

  switch (outcome.status) {
    case 'restored':
    case 'no-membership':
      rememberDevelopmentToken(accessToken);
      return { status: 'signed-in', workspaces: outcome.workspaces, error: null };
    case 'unauthenticated':
      // The API answered `401`: the token is not valid any more.
      deps.session.clear();
      forgetDevelopmentToken();
      return { status: 'rejected', workspaces: [], error: outcome.error };
    default:
      deps.session.clear();
      return { status: 'failed', workspaces: [], error: outcome.error };
  }
}

/**
 * Keeps the development token so a reload does not cost the role.
 *
 * The access token of a real session lives **in memory only** — that is the
 * invariant the app is built around. A development token is a different
 * thing: a locally minted credential with no refresh cookie behind it, so
 * without this a reload would silently fall back to whatever session the
 * cookie holds and the presenter would lose the identity they came for.
 *
 * It is therefore kept in `sessionStorage` — per tab, and only in a
 * development build. The production bundle has no path that writes it.
 */
export function rememberDevelopmentToken(token: string): void {
  if (!isDevelopmentBuild() || typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    sessionStorage.setItem(DEV_TOKEN_STORAGE_KEY, token);
  } catch {
    // A browser that refuses the storage (private mode, a full quota) is
    // not a reason to fail the sign-in: the session is in memory anyway.
  }
}

/** The development token of this tab, if there is one. */
export function readRememberedDevelopmentToken(): string | null {
  if (!isDevelopmentBuild() || typeof sessionStorage === 'undefined') {
    return null;
  }

  try {
    return sessionStorage.getItem(DEV_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Forgets the development token of this tab. */
export function forgetDevelopmentToken(): void {
  if (!isDevelopmentBuild() || typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    sessionStorage.removeItem(DEV_TOKEN_STORAGE_KEY);
  } catch {
    // Nothing to do: the token was not stored in the first place.
  }
}

/**
 * Whether the text has the shape of a bearer token.
 *
 * This is a shape check, not a verification: it catches a mistyped or
 * half-pasted token before a pointless round trip, and nothing more.
 */
export function looksLikeBearerToken(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

/**
 * The instant the token expires, read from its payload.
 *
 * The payload is **not** verified — it is decoded, not trusted, and it only
 * feeds a label. A token whose payload cannot be read is assumed to live for
 * the API's default lifetime.
 */
export function expiryOf(token: string): string {
  const expiry = readExpiryClaim(token);
  if (expiry !== null) {
    return new Date(expiry).toISOString();
  }
  return new Date(Date.now() + ASSUMED_TOKEN_LIFETIME_MS).toISOString();
}

/** The `exp` claim of the token, in milliseconds, or `null`. */
function readExpiryClaim(token: string): number | null {
  const payload = decodeJwtPayload(token);
  if (payload === null) {
    return null;
  }

  const exp = (payload as { exp?: unknown }).exp;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) {
    return null;
  }

  // The claim is in seconds since the epoch.
  return exp * 1000;
}

/**
 * Decodes the payload of a JWT, or returns `null`.
 *
 * The payload is base64url and may hold UTF-8, so it is decoded through the
 * byte array and a `TextDecoder` rather than `atob`, which would mangle
 * anything above U+00FF.
 */
function decodeJwtPayload(token: string): unknown {
  const segment = token.split('.')[1];
  if (segment === undefined || segment === '') {
    return null;
  }

  try {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    // A token that cannot be decoded is simply treated as one without an
    // expiry claim.
    return null;
  }
}
