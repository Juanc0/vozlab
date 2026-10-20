/**
 * The fixtures of the E2E suite.
 *
 * Every test gets:
 *
 * - a **real session**: the event-code join, with the refresh cookie the app
 *   restores itself (the access token lives in memory, the cookie is
 *   `HttpOnly` — the suite never reads a credential it does not own);
 * - a **marker**, a unique string every object of the test carries, so the
 *   clean-up removes the objects of the test and only those;
 * - an **API client** of the session, for the fixtures a journey needs and
 *   for the read-back that proves what the app did.
 */

import { test as base, expect } from '@playwright/test';
import { ApiClient } from './api';
import { API_ORIGIN } from './config';
import {
  eventCode,
  openEventSession,
  readRefreshCookie,
  refreshCookie,
  refreshEventSession,
  type EventSession
} from './session';

/** The fixtures every worker of the run shares. */
interface WorkerFixtures {
  /** The session of the run — one user, one refresh family. */
  eventSession: EventSession;
}

/** The session of a test. */
export interface TestSession {
  /** The access token of the session. */
  accessToken: string;
  /** The moment the access token expires (ISO-8601). */
  expiresAt: string;
  /** The id of the anonymous user the join created. */
  userId: string;
  /** The pseudonym of the user — what the API compares. */
  authorHash: string;
  /** The display name of the user. */
  alias: string;
  /** The workspace the user joined. */
  workspaceId: string;
  /** The name of the workspace the user joined. */
  workspaceName: string;
  /** The unique marker of the test. */
  marker: string;
}

/** The fixtures every test gets. */
interface TestFixtures {
  /** The session of the test. */
  session: TestSession;
  /** The API client of the session — it owns the clean-up. */
  api: ApiClient;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  eventSession: [
    async ({ playwright }, use) => {
      // An isolated jar: it keeps the refresh cookie of the run, and the
      // cookie is rotated by the API on every call.
      const jar = await playwright.request.newContext({
        baseURL: API_ORIGIN
      });

      const alias = `E2E ${new Date().toISOString()}`;
      const opened = await openEventSession(jar, eventCode(), alias);

      await use({ jar, ...opened });

      await jar.dispose();
    },
    { scope: 'worker' }
  ],

  session: async ({ context, eventSession }, use) => {
    // The access token lives 15 minutes: it is renewed only when it is about
    // to expire. The refresh token is rotated by the API on every call, so
    // the jar must hold the token the browser rotated last — the teardown
    // below copies it back.
    let accessToken = eventSession.accessToken;
    let expiresAt = eventSession.expiresAt;

    if (Date.parse(expiresAt) - Date.now() < 60_000) {
      const renewed = await refreshEventSession(eventSession.jar);
      accessToken = renewed.accessToken;
      expiresAt = renewed.expiresAt;
    }

    const cookie = await readRefreshCookie(eventSession.jar);

    await context.addCookies([refreshCookie(cookie)]);

    const session: TestSession = {
      accessToken,
      expiresAt,
      userId: eventSession.userId,
      authorHash: eventSession.authorHash,
      alias: eventSession.alias,
      workspaceId: eventSession.workspaceId,
      workspaceName: eventSession.workspaceName,
      marker: uniqueMarker()
    };

    await use(session);

    // The app rotated the cookie too (it restores the session in the
    // browser): the jar follows it, so the next test does not present a
    // token that was already rotated.
    const rotated = await context.cookies();
    const current = rotated.find((candidate) => candidate.name === 'vozlab_refresh');

    if (current !== undefined) {
      await eventSession.jar.addCookies([current]);
    }
  },

  api: async ({ request, session }, use) => {
    const api = new ApiClient({
      request,
      accessToken: session.accessToken,
      workspaceId: session.workspaceId,
      marker: session.marker
    });

    await use(api);

    // The objects the test created are removed: the API soft-deletes the
    // nodes, the relations and the comments, closes the threads and rejects
    // the proposals. What the API cannot remove is reported in the run
    // report, not in the test.
    await api.cleanup(session.authorHash);
  }
});

export { expect };

/** A unique string that marks the objects of a test. */
export function uniqueMarker(): string {
  return `e2e-${Math.random().toString(36).slice(2, 10)}`;
}
