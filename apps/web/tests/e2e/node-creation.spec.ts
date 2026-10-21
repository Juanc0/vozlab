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
  await expect(page.getByRole('combobox', { name: 'Espacio de trabajo' })).toHaveValue(api.workspaceId);

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

  const opener = page.getByRole('button', { name: 'Nuevo nodo' });
  await expect(opener).toBeEnabled();
  await opener.click();

  const dialog = page.getByRole('dialog', { name: 'Nuevo nodo' });
  await expect(dialog).toBeVisible();

  // The fields come from the ontology of the workspace.
  await dialog.getByLabel('Clase de la ontología').selectOption('Problem');

  // A title of two characters is refused by the form.
  await dialog.getByLabel('Título').fill('ab');
  await dialog.getByRole('button', { name: 'Crear el nodo' }).click();

  await expect(
    dialog.getByText('El título debe tener al menos 3 caracteres.', { exact: true })
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

  const opener = page.getByRole('button', { name: 'Nuevo nodo' });
  await expect(opener).toBeEnabled();
  await opener.click();

  const dialog = page.getByRole('dialog', { name: 'Nuevo nodo' });
  await dialog.getByLabel('Clase de la ontología').selectOption('Problem');
  await dialog.getByLabel('Título').fill(`${api.marker} created node`);

  // The class of the ontology declares two mandatory attributes: the form
  // refuses to send a node without them.
  await dialog.getByLabel('Sector').selectOption('Transporte');
  await dialog.getByLabel('Alcance').selectOption('Campus');

  await dialog.getByRole('button', { name: 'Crear el nodo' }).click();

  // The dialog is closed and the outcome is announced.
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/se ha creado y está pendiente de revisión/)).toBeVisible();

  // The node is in the list of the workspace, and it is pending: the class
  // and the status are the **names** of the interface, not the keys of the
  // system.
  const entry = page.getByRole('listitem').filter({ hasText: `${api.marker} created node` });
  await expect(entry.getByRole('button', { name: `${api.marker} created node` })).toBeVisible();
  await expect(entry).toContainText('Problema · Pendiente');
});
