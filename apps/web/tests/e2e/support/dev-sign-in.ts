/**
 * The development sign-in as a workspace administrator.
 *
 * The admin journeys (join codes, invitations, direct add, hygiene) need an
 * ADMIN session, and the event-code join of the suite creates an anonymous
 * GUEST. The bridge is the same one the demo presenter uses by hand:
 * `global-setup` mints the maintainer JWT with `db:mint-token` (resolved
 * against the tenant's LIVE `oidc_tenant_id`), and the browser adopts it
 * through the development panel of `/login` — which only exists in a dev
 * build, exactly what `pnpm --filter @vozlab/web dev` serves.
 *
 * Nothing here bypasses the app: the token goes through the same input, the
 * same `POST`-free client call to `GET /auth/me` proves it, and the session
 * lives in memory like any other.
 */

import { type Page } from '@playwright/test';

/** The maintainer JWT `globalSetup` minted for this run. */
export function maintainerToken(): string {
  const token = process.env['E2E_MAINTAINER_TOKEN'];

  if (token === undefined || token === '') {
    throw new Error(
      'The maintainer token of the run is missing (E2E_MAINTAINER_TOKEN). The global setup did not run — start the suite with `pnpm --filter @vozlab/web test:e2e`.'
    );
  }

  return token;
}

/**
 * Signs the browser in as `dev-maintainer` and waits for the landing route.
 *
 * The panel keeps its submit button disabled until hydration: the click
 * waits for it, so the fill+click is race-free by construction. A rejected
 * token never lands — the test fails here with the panel's own alert.
 *
 * `landing` is a Playwright URL pattern: the login page forwards its `next`
 * parameter to the app after adopting the token.
 */
export async function signInAsMaintainer(page: Page, landing = '**/'): Promise<void> {
  // The path of the landing pattern doubles as the `next` of the login.
  const next = landing.replace(/^\*\*/, '').split('?')[0] || '/';
  await page.goto(`/login?next=${encodeURIComponent(next)}`);

  await page.getByLabel('Token de desarrollo').fill(maintainerToken());
  await page.getByRole('button', { name: 'Entrar con esta identidad' }).click();

  await page.waitForURL(landing, { timeout: 15_000 });
}
