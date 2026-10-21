/**
 * Journey — the exploration view.
 *
 * The exploration view lives **next to** the subgraph view: the switch in
 * the toolbar changes what the body of the page shows, and both views stay
 * reachable. The view states what the window is, presents a node, expands it
 * with its badge, and the list view remains the text alternative of both
 * modes.
 */

import { openList, waitForApp } from './support/app';
import { expect, test } from './support/fixtures';

test('the exploration view is next to the subgraph, presents a node and expands it', async ({
  page,
  api
}) => {
  const node = await api.createNode({ typeKey: 'Problem', title: `${api.marker} explore node` });

  await page.goto('/');
  await waitForApp(page);

  // The switch between the two views.
  await page.getByText('Explorar', { exact: true }).click();

  // The canvas of the window.
  const canvas = page.getByRole('img', { name: 'Lienzo de la ventana de exploración' });
  await expect(canvas).toBeVisible();

  // The window says what it is: closed, ordered by creation and bounded.
  await expect(page.getByText(/La ventana es un grafo/)).toBeVisible();
  await expect(page.getByText(/viene en orden de/)).toBeVisible();
  await expect(page.getByText(/sin paginación/)).toBeVisible();

  // The view presents a node: the newest one of the window.
  await expect(page.getByText(`Se presenta «${node.title}».`)).toBeVisible();

  // The badge of the node expands it, and the expansion is permanent.
  //
  // The badge is the control of the node the view **presents**: every node
  // is a card with its title inside, so the window does not fit in a canvas
  // at a zoom where the titles can be read — the reader pans and zooms.
  const badges = page.getByRole('toolbar', { name: 'Los nodos de la ventana' }).getByRole('button');
  const badge = badges.first();

  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('aria-pressed', 'true');

  await badge.click();
  await expect(badge).toHaveAttribute('aria-pressed', 'false');

  // The criterion is the user's choice.
  await page.getByText('El más relacionado', { exact: true }).click();
  await expect(page.getByRole('radio', { name: 'El más relacionado' })).toBeChecked();

  // The list view is the text alternative of the window too.
  await openList(page);

  const nodeTable = page.getByRole('region', { name: 'Los nodos del subgrafo' });
  await expect(nodeTable.getByRole('button', { name: node.title })).toBeVisible();

  // And the subgraph view is still there: it asks for its root again.
  await page.getByText('Subgrafo', { exact: true }).click();

  // The panel of the root picker is folded away while the list is on
  // screen — a list that runs under a floating panel is a list the reader
  // cannot click — and the toolbar opens it.
  await page.getByRole('button', { name: 'Raíz', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nodo raíz' })).toBeVisible();
});

test('a relation expands into a card, and the list shows its content', async ({
  page,
  api
}) => {
  const source = await api.createNode({
    typeKey: 'Problem',
    title: `${api.marker} relation source`
  });
  const target = await api.createNode({
    typeKey: 'Idea',
    title: `${api.marker} relation target`
  });

  const relation = await api.createEdge({
    sourceNodeId: source.id,
    targetNodeId: target.id,
    relationKey: 'RELATES_TO',
    attributes: { sector: api.marker }
  });

  await page.goto('/');
  await waitForApp(page);

  await page.getByText('Explorar', { exact: true }).click();

  // The list view is the text alternative of the canvas: the content of the
  // relation is in the list, not only in the picture.
  await openList(page);

  const relations = page.getByRole('region', { name: 'Las relaciones del subgrafo' });
  const row = relations.getByRole('row').filter({ hasText: api.marker });

  await expect(row).toBeVisible();
  await expect(row.getByText('sector')).toBeVisible();

  // Selecting the relation in the list shows its badge on its line.
  await row.getByRole('button', { name: 'Se relaciona con', exact: true }).click();

  // The picture comes back: the badge of the relation is on its line.
  await page.getByRole('button', { name: 'Lista', exact: true }).click();

  const badge = page.locator(`[data-edge-id="${relation.id}"]`);

  await expect(badge).toBeVisible();

  // The badge expands the relation: it becomes a card.
  await badge.click();

  await expect(badge).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('button', { name: 'Contraer la relación «Se relaciona con»' })
  ).toBeVisible();
});
