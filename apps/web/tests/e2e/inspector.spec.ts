/**
 * Journey 8 — the inspector.
 *
 * The column of tabs beside the canvas shows the selected node and the
 * selected relation, and the asymmetry of the API is visible: a relation
 * the signed-in user created can be edited directly, a node never can.
 */

import { waitForApp } from './support/app';
import { expect, test } from './support/fixtures';

test('the inspector shows the node and the relation, and the relation can be edited directly', async ({
  page,
  api
}) => {
  const node = await api.createNode({
    typeKey: 'Problem',
    title: `${api.marker} inspector node`,
    description: 'A problem with a description.'
  });
  const idea = await api.createNode({ typeKey: 'Idea', title: `${api.marker} inspector idea` });
  const edge = await api.createEdge({
    sourceNodeId: node.id,
    targetNodeId: idea.id,
    relationKey: 'RELATES_TO'
  });

  await page.goto('/');
  await waitForApp(page);

  // The four tabs are there from the start.
  await expect(page.getByRole('tab', { name: 'Contenido' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Atributos' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Propuestas' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Foro' })).toBeVisible();

  // The node is picked as the root: the inspector shows it.
  await page.getByRole('button', { name: node.title }).first().click();

  const inspector = page.getByRole('complementary').filter({ hasText: 'Inspección' });
  await expect(inspector.getByRole('heading', { name: node.title })).toBeVisible();
  await expect(inspector.getByText('A problem with a description.')).toBeVisible();

  // The relation is picked in the list: the inspector shows it.
  await page.getByRole('button', { name: 'Se relaciona con' }).first().click();

  await expect(inspector.getByRole('heading', { name: 'Se relaciona con' })).toBeVisible();
  await expect(inspector.getByText(node.title)).toBeVisible();
  await expect(inspector.getByText(idea.title)).toBeVisible();

  // The relation was created by the signed-in user: it can be edited
  // directly.
  await page.getByRole('tab', { name: 'Atributos' }).click();

  const edit = page.getByRole('button', { name: 'Editar directamente' });
  await expect(edit).toBeEnabled();

  await edit.click();
  await page.getByLabel('Clave de la relación').fill('INVOLVES');
  await page.getByRole('button', { name: 'Guardar los cambios' }).click();

  await expect(page.getByText('La relación se ha actualizado.')).toBeVisible();

  // The server is the authority: the relation carries the new key.
  const saved = await api.getEdge(edge.id);
  expect(saved.relationKey).toBe('INVOLVES');

  // A node has no direct edition: only the correction is offered, and the
  // reason is said out loud.
  await page.getByRole('button', { name: node.title }).first().click();
  await page.getByRole('tab', { name: 'Atributos' }).click();

  await expect(page.getByRole('button', { name: 'Sugerir una corrección' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar directamente' })).toHaveCount(0);
  await expect(page.getByText(/Un nodo no se edita directamente/)).toBeVisible();
});

test('the forum of the inspector answers the comment of the user', async ({ page, api }) => {
  const node = await api.createNode({ typeKey: 'Problem', title: `${api.marker} inspector forum` });

  await page.goto('/');
  await waitForApp(page);

  await page.getByRole('button', { name: node.title }).first().click();

  await page.getByRole('tab', { name: 'Foro' }).click();

  // A thread is opened about the node and a comment is posted in it.
  await page.getByLabel('Hilo nuevo').fill(`${api.marker} inspector thread`);
  await page.getByRole('button', { name: 'Abrir el hilo' }).click();

  const comment = `${api.marker} inspector comment`;
  await page.getByLabel('Escribe un comentario').fill(comment);
  await page.getByRole('button', { name: 'Publicar el comentario' }).click();

  await expect(page.getByText(comment, { exact: true })).toBeVisible();
});

test('the toggle gives the canvas the room and announces its state', async ({ page, api }) => {
  const node = await api.createNode({ typeKey: 'Problem', title: `${api.marker} inspector toggle` });

  await page.goto('/');
  await waitForApp(page);

  // A thing is selected: the column has something to show.
  await page.getByRole('button', { name: node.title }).first().click();
  await expect(page.getByRole('tabpanel')).toContainText(node.title);

  const toggle = page.getByRole('button', { name: 'Ocultar el inspector' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  await toggle.click();

  // The column is folded away and the toggle says it.
  await expect(page.getByRole('tab', { name: 'Contenido' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mostrar el inspector' })).toHaveAttribute(
    'aria-expanded',
    'false'
  );

  await page.getByRole('button', { name: 'Mostrar el inspector' }).click();
  await expect(page.getByRole('tab', { name: 'Contenido' })).toBeVisible();
});
