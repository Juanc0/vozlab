/**
 * Journey 3 — the creation of a node.
 *
 * The form is built from the active ontology: an invalid submission is
 * refused **before the request leaves the app**, a valid one creates a
 * `PENDING` node that shows up in the list.
 */

import { waitForApp } from './support/app';
import { expect, test } from './support/fixtures';

test('the form refuses an invalid submission before the request leaves the app', async ({
  page,
  api
}) => {
  await page.goto('/');
  await waitForApp(page);

  // The app is in the workspace of the session.
  await expect(page.getByRole('combobox', { name: 'Workspace' })).toHaveValue(api.workspaceId);

  // Every request that is not a read is watched from now on: an invalid
  // form must not produce one. (The session restore happens before the
  // watch starts — it is the app that comes back, not a write of the
  // workspace.)
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') {
      writes.push(`${request.method()} ${request.url()}`);
    }
  });

  const opener = page.getByRole('button', { name: 'New node' });
  await expect(opener).toBeEnabled();
  await opener.click();

  const dialog = page.getByRole('dialog', { name: 'New node' });
  await expect(dialog).toBeVisible();

  // The fields come from the ontology of the workspace.
  await dialog.getByLabel('Ontology class').selectOption('Problem');

  // A title of two characters is refused by the form.
  await dialog.getByLabel('Title').fill('ab');
  await dialog.getByRole('button', { name: 'Create the node' }).click();

  await expect(
    dialog.getByText('The title must be at least 3 characters.', { exact: true })
  ).toBeVisible();

  // Nothing left the app.
  expect(writes).toEqual([]);
});

test('a valid submission creates a pending node that shows up in the list', async ({
  page,
  api
}) => {
  await page.goto('/');
  await waitForApp(page);

  const opener = page.getByRole('button', { name: 'New node' });
  await expect(opener).toBeEnabled();
  await opener.click();

  const dialog = page.getByRole('dialog', { name: 'New node' });
  await dialog.getByLabel('Ontology class').selectOption('Problem');
  await dialog.getByLabel('Title').fill(`${api.marker} created node`);
  await dialog.getByRole('button', { name: 'Create the node' }).click();

  // The dialog is closed and the outcome is announced.
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/was created and is pending review/)).toBeVisible();

  // The node is in the list of the workspace, and it is pending.
  const entry = page.getByRole('listitem').filter({ hasText: `${api.marker} created node` });
  await expect(entry.getByRole('button', { name: `${api.marker} created node` })).toBeVisible();
  await expect(entry).toContainText('Problem · PENDING');
});
