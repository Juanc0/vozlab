/**
 * Journey 7 — the offline mode.
 *
 * The PWA is online-first and **read-only offline**: a write is refused with
 * `ERR_OFFLINE` and **no non-GET request leaves the app**. The refusal is
 * local: the API never answered, so there is no API code to show.
 */

import { waitForApp } from './support/app';
import { expect, test } from './support/fixtures';

test('a write is refused while the browser is offline and no request leaves the app', async ({
  page,
  context,
  api
}) => {
  await page.goto('/');
  await waitForApp(page);

  const opener = page.getByRole('button', { name: 'New node' });
  await expect(opener).toBeEnabled();

  // Every request that is not a read is watched from the moment the browser
  // goes offline.
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') {
      writes.push(`${request.method()} ${request.url()}`);
    }
  });

  await context.setOffline(true);

  // The banner says it before the user tries.
  await expect(page.getByText('You are offline.')).toBeVisible();

  await opener.click();

  const dialog = page.getByRole('dialog', { name: 'New node' });
  await dialog.getByLabel('Ontology class').selectOption('Problem');
  await dialog.getByLabel('Title').fill(`${api.marker} offline node`);
  await dialog.getByRole('button', { name: 'Create the node' }).click();

  // The refusal carries the local code and explains itself.
  const alert = dialog.getByRole('alert').filter({ hasText: 'ERR_OFFLINE' });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('ERR_OFFLINE');

  // Nothing was sent: the write was refused before the request left the app.
  expect(writes).toEqual([]);
});
