/**
 * Journey 1 — the sign-in with an event code.
 *
 * The code is the whole credential: there is no identity provider in the
 * local stack. A valid code reaches the app, the workspace is selected and
 * the role of the user is shown; an invalid code shows the API's own code and
 * message and leaves the user on the page.
 */

import { waitForApp } from './support/app';
import { WEB_ORIGIN } from './support/config';
import { expect, test, uniqueMarker } from './support/fixtures';
import { eventCode } from './support/session';

test.describe('the event-code join', () => {
  test('a valid code reaches the app, selects the workspace and shows the role', async ({
    page
  }) => {
    await page.goto('/join');
    await waitForApp(page);

    await page.getByLabel('Event code').fill(eventCode());
    await page.getByLabel('Display name').fill(`Attendee ${uniqueMarker()}`);
    await page.getByRole('button', { name: 'Join the event' }).click();

    // The app is reached — the URL stays clean, the workspace is not a path
    // segment.
    await expect(page).toHaveURL(`${WEB_ORIGIN}/`);
    await expect(page.getByRole('heading', { name: 'Graph', level: 1 })).toBeVisible();

    // The workspace is selected: the selector holds a real workspace and the
    // user is a member of it.
    const workspace = page.getByRole('combobox', { name: 'Workspace' });
    await expect(workspace).toBeEnabled();
    await expect(workspace).toHaveValue(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );

    // The role of the user is shown — it comes from the membership, never
    // from the UI.
    const role = page.getByText('Your role here:');
    await expect(role).toBeVisible();
    await expect(role).toContainText('MEMBER');
  });

  test('an invalid code shows the API code and message and stays on the page', async ({
    page
  }) => {
    await page.goto('/join');
    await waitForApp(page);

    await page.getByLabel('Event code').fill('vle_this-code-does-not-exist-0000');
    await page.getByRole('button', { name: 'Join the event' }).click();

    // The envelope of the API is what the user sees — never a status line.
    const alert = page.getByRole('alert').filter({ hasText: 'ERR_EVENT_EXPIRED' });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('ERR_EVENT_EXPIRED');
    await expect(alert).toContainText('Event code has expired or is invalid');

    // The page did not change.
    await expect(page).toHaveURL(/\/join$/);
    await expect(page.getByRole('heading', { name: 'Join an event', level: 1 })).toBeVisible();
  });
});
