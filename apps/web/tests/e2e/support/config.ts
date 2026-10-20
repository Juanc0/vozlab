/**
 * The endpoints and the identifiers the suite talks to.
 *
 * The ports are the ones of the local stack of `docs/runbook-dev.md`: the API
 * on `:3000` and the PWA on `:5173`. They can be overridden with
 * `E2E_WEB_PORT` / `E2E_API_PORT`; the configuration of Playwright reads the
 * same values, so the browser and the suite never disagree.
 */

const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5173);
const API_PORT = Number(process.env.E2E_API_PORT ?? 3000);

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
