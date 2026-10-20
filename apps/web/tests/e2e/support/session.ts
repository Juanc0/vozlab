/**
 * The session of a test.
 *
 * The PWA keeps the access token **in memory** and the refresh token in an
 * `HttpOnly` cookie: a suite that wants a session has to open a real one.
 * The local path is the event-code join — the same one the runbook documents
 * and the one the `/join` screen uses.
 *
 * The session is opened **once per run** (a worker-scoped fixture) and the
 * refresh cookie follows the browser: the API rotates the token on every
 * call and reads the presentation of an already-rotated token as a theft, so
 * the cookie the browser rotated is copied back into the jar of the worker
 * after every test. One user per run, no revocation.
 */

import type { APIRequestContext, APIResponse } from '@playwright/test';
import { API_BASE_URL, REFRESH_COOKIE_NAME } from './config';

/**
 * The rate limit of the public auth routes.
 *
 * The join, the refresh and the logout share a per-IP budget of 30 writes
 * per minute. A suite that is run several times in a row can exhaust it;
 * the calls are then retried after the window has moved.
 */
const RATE_LIMIT_RETRIES = 6;
const RATE_LIMIT_WAIT_MS = 10_000;

/** The event code the global setup created for this run. */
export function eventCode(): string {
  const code = process.env['E2E_EVENT_CODE'];

  if (code === undefined || code === '') {
    throw new Error(
      'The event code of the run is missing (E2E_EVENT_CODE). The global setup did not run — start the suite with `pnpm --filter @vozlab/web test:e2e`.'
    );
  }

  return code;
}

/** The session of the run: the user, its jar of cookies and its workspace. */
export interface EventSession {
  /** The isolated request context that holds the refresh cookie. */
  readonly jar: APIRequestContext;
  /** The access token of the session. */
  readonly accessToken: string;
  /** The moment the access token expires (ISO-8601). */
  readonly expiresAt: string;
  /** The id of the anonymous user the join created. */
  readonly userId: string;
  /** The pseudonym of the user — what the API compares. */
  readonly authorHash: string;
  /** The display name of the user. */
  readonly alias: string;
  /** The workspace the user joined. */
  readonly workspaceId: string;
  /** The name of the workspace the user joined. */
  readonly workspaceName: string;
}

/** The answer of a join (`POST /api/v1/auth/event-join`). */
interface AuthSessionBody {
  accessToken: string;
  expiresAt: string;
  user: {
    id: string;
    anonymousAlias: string | null;
    authorHash: string;
  };
}

/** The answer of `GET /api/v1/auth/me`. */
interface AuthMeBody {
  workspaces: { id: string; slug: string; name: string; role: string }[];
}

/** Joins an event and reads the memberships of the new user. */
export async function openEventSession(
  jar: APIRequestContext,
  code: string,
  alias: string
): Promise<Omit<EventSession, 'jar'>> {
  const joined = await withRateLimitRetry(() =>
    jar.post(`${API_BASE_URL}/auth/event-join`, { data: { code, alias } })
  );

  if (!joined.ok()) {
    throw new Error(
      `The event join failed (${joined.status()}): ${await joined.text()}. Is the code of this run still valid?`
    );
  }

  const body = (await joined.json()) as AuthSessionBody;

  const me = await jar.get(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${body.accessToken}` }
  });

  if (!me.ok()) {
    throw new Error(`GET /auth/me failed (${me.status()}): ${await me.text()}`);
  }

  const memberships = (await me.json()) as AuthMeBody;
  const workspace = memberships.workspaces[0];

  if (workspace === undefined) {
    throw new Error('The event join did not grant a membership in any workspace.');
  }

  return {
    accessToken: body.accessToken,
    expiresAt: body.expiresAt,
    userId: body.user.id,
    authorHash: body.user.authorHash,
    alias,
    workspaceId: workspace.id,
    workspaceName: workspace.name
  };
}

/**
 * Rotates the refresh token and returns the new access token.
 *
 * The rotation is the point: the browser of the previous test rotated the
 * cookie too, so the jar must always hold the **current** token.
 */
export async function refreshEventSession(jar: APIRequestContext): Promise<{
  accessToken: string;
  expiresAt: string;
}> {
  const refreshed = await withRateLimitRetry(() => jar.post(`${API_BASE_URL}/auth/refresh`));

  if (!refreshed.ok()) {
    throw new Error(
      `The refresh failed (${refreshed.status()}): ${await refreshed.text()}. The refresh family of the run was revoked — start the run again.`
    );
  }

  const body = (await refreshed.json()) as { accessToken: string; expiresAt: string };
  return { accessToken: body.accessToken, expiresAt: body.expiresAt };
}

/** The value of the refresh cookie of a jar of cookies. */
export async function readRefreshCookie(jar: APIRequestContext): Promise<string> {
  const cookies = await jar.cookies();
  const cookie = cookies.find((candidate) => candidate.name === REFRESH_COOKIE_NAME);

  if (cookie === undefined) {
    throw new Error('The refresh cookie is missing from the jar of the session.');
  }

  return cookie.value;
}

/** The cookie the browser needs to restore the session. */
export function refreshCookie(value: string): {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  sameSite: 'Lax';
  secure: boolean;
} {
  return {
    name: REFRESH_COOKIE_NAME,
    value,
    // The domain and the path are set **explicitly**: a URL would make
    // Playwright derive the path from its directory (`/api/v1/auth/`), and
    // the browser would then hold two cookies with the same name — the one
    // of the API (`/api/v1/auth`) and the one of the suite. Both would
    // travel with every auth request.
    domain: 'localhost',
    path: '/api/v1/auth',
    httpOnly: true,
    sameSite: 'Lax',
    // The local stack is plain HTTP: a secure cookie would never be sent.
    secure: false
  };
}

/**
 * Runs a call and retries it while the API refuses it with its rate limit.
 *
 * The window of the limiter is fixed: it moves on its own, so the call is
 * simply tried again after a pause.
 */
async function withRateLimitRetry(operation: () => Promise<APIResponse>): Promise<APIResponse> {
  let response = await operation();

  for (let attempt = 0; attempt < RATE_LIMIT_RETRIES && response.status() === 429; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_WAIT_MS));
    response = await operation();
  }

  return response;
}
