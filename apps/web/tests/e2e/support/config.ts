/**
 * The endpoints and the identifiers the suite talks to.
 *
 * The suite runs on **its own pair of ports**, next to the local stack of
 * `docs/runbook-dev.md` (API on `:3000`, PWA on `:5173`), so a developer who
 * keeps the stack running does not lend it to the suite. That matters:
 * Playwright starts the API of the run with a **test budget** for the rate
 * limiter (the suite is one actor and writes as one person, so the real
 * 30 writes/minute would refuse the last journeys with `429`), and a reused
 * server would keep its own limits.
 *
 * They can be overridden with `E2E_WEB_PORT` / `E2E_API_PORT`; the
 * configuration of Playwright reads the same values, so the browser and the
 * suite never disagree.
 */

const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5174);
const API_PORT = Number(process.env.E2E_API_PORT ?? 3100);

/** The origin of the PWA — the browser navigates here. */
export const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;

/** The origin of the API — the PWA calls it from the browser. */
export const API_ORIGIN = `http://localhost:${API_PORT}`;

/** The base URL of the API — the prefix of every resource route. */
export const API_BASE_URL = `${API_ORIGIN}/api/v1`;

/** The port the API of this run listens on. */
export const API_PORT_NUMBER = API_PORT;

/** The port the dev server of this run listens on. */
export const WEB_PORT_NUMBER = WEB_PORT;

/**
 * The workspace of the dev seed.
 *
 * It is the fixed id of `packages/database/scripts/dev-identities.ts`; the
 * event code of the run targets it and every request of the suite carries it
 * in `X-Workspace-ID`.
 */
export const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';

/** The name of the refresh cookie (`apps/api/.../authCookies.ts`). */
export const REFRESH_COOKIE_NAME = 'vozlab_refresh';

/**
 * The URL the refresh cookie is bound to.
 *
 * The cookie is scoped to `/api/v1/auth` and to the origin of the API: the
 * browser only sends it to the auth routes, never to the graph ones.
 */
export const REFRESH_COOKIE_URL = `${API_ORIGIN}/api/v1/auth/refresh`;
