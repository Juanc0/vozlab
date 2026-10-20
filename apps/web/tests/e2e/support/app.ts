/**
 * The helpers the journeys share.
 */

import type { Page } from '@playwright/test';

/**
 * The number of times the suite takes the app's offer to restore the session
 * again, and the pause between two attempts.
 *
 * The public auth routes share a per-IP rate limit of 30 writes per minute:
 * a suite that is run several times in a row can hit it, and the app then
 * cannot restore the session.
 */
const RESTORE_ATTEMPTS = 6;
const RESTORE_WAIT_MS = 10_000;

/**
 * Waits until the app has taken over the page.
 *
 * The PWA is **server-rendered**: until the client is hydrated, a form is a
 * plain HTML form and a submit is a **native** one — it would navigate and
 * put the event code of the join screen in the URL. The suite therefore
 * waits for the network to settle (the client modules and the reads of the
 * app are done) before it interacts with the page.
 *
 * The wait is also what makes the reads of the app deterministic: when it
 * returns, the page shows the data it fetched — or the error the app
 * reports. When the app could not restore the session (the rate limit of
 * the API, for instance), it says so and offers to try again: the suite
 * takes the offer.
 */
export async function waitForApp(page: Page): Promise<void> {
  for (let attempt = 0; attempt < RESTORE_ATTEMPTS; attempt += 1) {
    await page.waitForLoadState('networkidle');

    const retry = page.getByRole('button', { name: 'Intentar de nuevo' });

    if ((await retry.count()) === 0) {
      return;
    }

    await page.waitForTimeout(RESTORE_WAIT_MS);
    await retry.click();
  }
}
