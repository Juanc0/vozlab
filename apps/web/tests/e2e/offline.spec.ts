/**
 * Journey 7 — the offline mode.
 *
 * The PWA is online-first and **read-only offline**: a write is refused with
 * `ERR_OFFLINE` and **no non-GET request leaves the app**. The refusal is
 * local: the API never answered, so there is no API code to show.
 */

import { waitForApp } from './support/app';
import { expect, test } from './support/fixtures';
import { signInAsMaintainer } from './support/dev-sign-in';

test('a write is refused while the browser is offline and no request leaves the app', async ({
  page,
  context,
  api
}) => {
  await page.goto('/');
  await waitForApp(page);

  const opener = page.getByRole('button', { name: 'Nuevo nodo' });
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
  await expect(page.getByText('Estás sin conexión.')).toBeVisible();

  await opener.click();

  const dialog = page.getByRole('dialog', { name: 'Nuevo nodo' });
  await dialog.getByLabel('Clase de la ontología').selectOption('Problem');
  await dialog.getByLabel('Título').fill(`${api.marker} offline node`);

  // The class of the ontology declares two mandatory attributes: the form
  // refuses to send a node without them.
  await dialog.getByLabel('Sector').selectOption('Transporte');
  await dialog.getByLabel('Alcance').selectOption('Campus');

  await dialog.getByRole('button', { name: 'Crear el nodo' }).click();

  // The refusal carries the local code and explains itself.
  const alert = dialog.getByRole('alert').filter({ hasText: 'ERR_OFFLINE' });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('ERR_OFFLINE');

  // Nothing was sent: the write was refused before the request left the app.
  expect(writes).toEqual([]);
});

/**
 * P2 item 12 — the admin routes offline.
 *
 * `/admin` is not a special island: offline it must behave like the rest of
 * the app. The refusal is local (no request leaves the browser, the API is
 * never reached); the session and the panel survive — the operator sees the
 * offline state, not a login redirect or a crash; and every write (creating
 * a join code here, adding a member there) is refused before it departs.
 *
 * The admin panel of these journeys belongs to the **maintainer**: the
 * development sign-in of the fixture is the only path to a workspace ADMIN
 * the browser can take (the event join is an anonymous guest).
 */

test('the admin panel stays open, banners the outage, and refuses its writes', async ({
  page,
  context,
}) => {
  await signInAsMaintainer(page, '**/admin');
  await expect(page.getByRole('heading', { name: 'Administración', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /General Campus/ })).toBeVisible();

  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') {
      writes.push(`${request.method()} ${request.url()}`);
    }
  });

  await context.setOffline(true);

  // The banner says it before the operator tries anything.
  await expect(page.getByText('Estás sin conexión.')).toBeVisible();

  // A write of the panel: creating an ephemeral join code.
  await page.getByRole('button', { name: 'Crear código efímero' }).click();

  // The refusal is local and explains itself; the panel does NOT fall to
  // the login (an offline network error is not an auth failure).
  const alert = page.getByRole('alert').first();
  await expect(alert).toContainText('offline');
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole('heading', { name: 'Administración', level: 1 })).toBeVisible();

  expect(writes).toEqual([]);
});

test('an offline workspace switch degrades the reads without breaking the session', async ({
  page,
  context,
}) => {
  await signInAsMaintainer(page, '**/admin');
  await expect(page.getByRole('button', { name: /General Campus/ })).toBeVisible();

  await context.setOffline(true);

  // Switching the selected workspace reloads its members over the network:
  // the read fails and the page shows the failure state — it does not
  // redirect to the login, and no non-GET leaves the browser.
  await page.getByRole('button', { name: /Open Community/ }).click();

  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page).toHaveURL(/\/admin/);
});
