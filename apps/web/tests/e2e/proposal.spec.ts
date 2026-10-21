/**
 * Journey 4 — the proposal of a correction and its review.
 *
 * The correction of a node is proposed **through the UI**: the form is
 * prefilled with the state of the target, the diff shows what changes, and
 * the proposal is created `PENDING`.
 *
 * The target is then read back **through the API** before and after the
 * resolution: a pending proposal changes nothing, and the approval is not
 * only a status on the screen.
 */

import { openInspector, openList, openRootPicker, waitForApp } from './support/app';
import { expect, test } from './support/fixtures';

test('a correction is proposed through the UI and the target is unchanged until the maintainer approves it', async ({
  page,
  api
}) => {
  const node = await api.createNode({
    typeKey: 'Problem',
    title: `${api.marker} proposal target`,
    description: 'The description of the target.'
  });
  const newTitle = `${api.marker} proposal target (edited)`;
  const justification = `${api.marker} justification`;

  await page.goto('/');
  await waitForApp(page);

  // The node is picked in the root picker: the inspector shows it.
  await openRootPicker(page);

  await page
    .getByRole('region', { name: 'Nodo raíz' })
    .getByRole('button', { name: node.title })
    .click();

  // The correction is proposed from the inspector.
  await openInspector(page);

  await page.getByRole('tab', { name: 'Atributos' }).click();

  const opener = page.getByRole('button', {
    name: `Sugerir una corrección del nodo ${node.title}`
  });
  await expect(opener).toBeVisible();
  await opener.click();

  const dialog = page.getByRole('dialog', { name: 'Proponer una corrección' });
  await expect(dialog).toBeVisible();

  // The form is prefilled with the state of the target.
  await expect(dialog.getByLabel('Título (obligatorio)')).toHaveValue(node.title);
  await expect(dialog.getByLabel('Descripción (opcional)')).toHaveValue('The description of the target.');

  // The proposal is a diff: the current value and the proposed one are shown,
  // and the fields that change are marked.
  await dialog.getByLabel('Título (obligatorio)').fill(newTitle);
  const titleRow = dialog.getByRole('row').filter({ hasText: 'Título' }).first();
  await expect(titleRow).toContainText('Cambia');
  await expect(titleRow).toContainText(newTitle);

  // A new attribute is proposed, with the kind of value it carries.
  await dialog.getByRole('button', { name: 'Añadir un atributo' }).click();
  await dialog.getByLabel('Clave del atributo 1', { exact: true }).fill('severity');
  await dialog.getByLabel('Tipo del atributo 1', { exact: true }).selectOption('number');
  await dialog.getByLabel('Valor del atributo 1', { exact: true }).fill('5');

  await dialog.getByLabel('Justificación (opcional)').fill(justification);

  await dialog.getByRole('button', { name: 'Proponer la corrección' }).click();

  // The dialog is closed and the outcome is announced: the proposal is
  // pending and the author of the target decides.
  await expect(dialog).toBeHidden();
  const link = page.getByRole('link', { name: 'Abrir la propuesta' });
  await expect(link).toBeVisible();

  // The target is **not** changed: a pending proposal changes nothing.
  const pending = await api.getNode(node.id);
  expect(pending.title).toBe(node.title);
  expect(pending.attributes).toEqual({});

  // The proposal is in the proposals screen, selected, with its delta.
  await link.click();
  await expect(page.getByRole('heading', { name: 'Cambio propuesto' })).toBeVisible();
  await expect(page.getByText(newTitle, { exact: true })).toBeVisible();

  // The maintainer of the target resolves it.
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await expect(page.getByText('La propuesta está ahora en Aprobada por la autoría.')).toBeVisible();

  // The target is really changed — read back through the API.
  const updated = await api.getNode(node.id);
  expect(updated.title).toBe(newTitle);
  expect(updated.attributes).toEqual({ severity: 5 });
});

test('a correction of a relation is proposed through the UI', async ({ page, api }) => {
  const source = await api.createNode({
    typeKey: 'Problem',
    title: `${api.marker} relation source`
  });
  const target = await api.createNode({ typeKey: 'Idea', title: `${api.marker} relation target` });
  const edge = await api.createEdge({
    sourceNodeId: source.id,
    targetNodeId: target.id,
    relationKey: 'RELATES_TO',
    attributes: { weight: 2 }
  });

  await page.goto('/');
  await waitForApp(page);

  await openRootPicker(page);

  await page
    .getByRole('region', { name: 'El nodo raíz del subgrafo' })
    .getByRole('button', { name: source.title })
    .click();

  await openList(page);

  const table = page.getByRole('region', { name: 'Las relaciones del subgrafo' });
  // The relation is named in the language of the interface.
  await expect(table.getByRole('rowheader', { name: 'Se relaciona con' })).toBeVisible();

  await table
    .getByRole('button', { name: 'Proponer una corrección de la relación Se relaciona con' })
    .click();

  const dialog = page.getByRole('dialog', { name: 'Proponer una corrección' });
  await expect(dialog).toBeVisible();

  // The relation of the subgraph carries no attribute: the form reads the
  // relation itself and prefills what it finds.
  await expect(dialog.getByLabel('Clave de la relación (obligatorio)')).toHaveValue('RELATES_TO');
  await expect(dialog.getByLabel('Clave del atributo 1', { exact: true })).toHaveValue('weight');
  await expect(dialog.getByLabel('Valor del atributo 1', { exact: true })).toHaveValue('2');

  await dialog.getByLabel('Valor del atributo 1', { exact: true }).fill('5');
  await dialog.getByRole('button', { name: 'Proponer la corrección' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole('link', { name: 'Abrir la propuesta' })).toBeVisible();

  // The relation is not changed yet.
  const pending = await api.getEdge(edge.id);
  expect(pending.attributes).toEqual({ weight: 2 });

  // The proposal is in the proposals screen and the maintainer approves it.
  await page.getByRole('link', { name: 'Abrir la propuesta' }).click();
  await expect(page.getByRole('heading', { name: 'Cambio propuesto' })).toBeVisible();

  await page.getByRole('button', { name: 'Aprobar' }).click();
  await expect(page.getByText('La propuesta está ahora en Aprobada por la autoría.')).toBeVisible();

  const updated = await api.getEdge(edge.id);
  expect(updated.attributes).toEqual({ weight: 5 });
});
