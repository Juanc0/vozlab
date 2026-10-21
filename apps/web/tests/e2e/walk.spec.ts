/**
 * Journey — walking the graph by clicking a node.
 *
 * The exploration view walks the graph: a click on a node asks the API for
 * the subgraph rooted at that node, at the depth that is selected, and the
 * answer is merged into the working set — what has been seen is never lost.
 *
 * The journey checks the things a reader can see: the request that leaves
 * the app, the picture that stays on screen while it is on its way, the
 * criterion of the focus that the click changes, and the numbers of the
 * picture — which have to be the truth.
 *
 * The journey writes nothing: the seeded graph is enough to walk, and the
 * write budget of the API is shared by the whole suite.
 */

import type { Page } from '@playwright/test';
import { openList, waitForApp } from './support/app';
import { expect, test } from './support/fixtures';

/**
 * Clicks a node of the picture.
 *
 * The card of a node is drawn by Cytoscape, on a `<canvas>`: there is no
 * element to click. The badge of the node is a real button **over** the
 * card, and it knows where the card is — so the card can be clicked with
 * the coordinates the badge carries.
 */
async function clickNodeInCanvas(page: Page, nodeId: string): Promise<void> {
  // The badge is the one of the toolbar of the nodes: the list has a
  // button with the same id, and it is not on the picture.
  const badge = page
    .getByRole('toolbar', { name: 'Los nodos de la ventana' })
    .locator(`[data-node-id="${nodeId}"]`);

  await expect(badge).toBeAttached();

  // The picture can be below the fold: the card is clicked where it is
  // drawn, and the browser only clicks what it can see.
  await badge.scrollIntoViewIfNeeded();

  const width = Number(await badge.getAttribute('data-node-width'));
  const height = Number(await badge.getAttribute('data-node-height'));
  const box = await badge.boundingBox();

  if (box === null) {
    throw new Error(`the badge of the node ${nodeId} has no box`);
  }

  // The badge sits at the top-right corner of the card, six pixels away.
  const centreX = box.x + box.width / 2 - width / 2 - 6;
  const centreY = box.y + box.height / 2 + height / 2 + 6;

  await page.mouse.click(centreX, centreY);
}

/** The number the scope of the picture says. */
async function scopeNumber(page: Page, pattern: RegExp): Promise<number> {
  const scope = page.locator('#explore-scope-count');

  return Number(pattern.exec((await scope.textContent()) ?? '')?.[1] ?? '0');
}

test('the exploration view walks the graph by clicking a node', async ({ page, api }) => {
  // The workspace holds nodes: there is something to walk to.
  const nodes = await api.listNodes();

  expect(nodes.length).toBeGreaterThan(0);

  await page.goto('/');
  await waitForApp(page);

  await page.getByText('Explorar', { exact: true }).click();

  const canvas = page.getByRole('img', { name: 'Lienzo de la ventana de exploración' });
  await expect(canvas).toBeVisible();

  // The depth of the exploration view is the depth of the whole app.
  await expect(page.locator('#explore-depth')).toHaveValue('1');

  // The criterion of the focus is the user's choice.
  await expect(page.getByRole('radio', { name: 'El más reciente' })).toBeChecked();

  // The node the view presents is the newest of the window: the first row
  // of the list is the same node. The list is one click away.
  await openList(page);

  const nodeTable = page.getByRole('region', { name: 'Los nodos del subgrafo' });
  const presentedId = await nodeTable
    .getByRole('button', { name: 'Caminar' })
    .first()
    .getAttribute('data-node-id');

  expect(presentedId).toBeTruthy();

  // The picture comes back: the walk happens on the canvas.
  await page.getByRole('button', { name: 'Lista', exact: true }).click();

  // The click asks for the subgraph rooted at the node that was clicked.
  const asked = page.waitForRequest((request) => request.url().includes('/nodes/subgraph'));

  await clickNodeInCanvas(page, presentedId ?? '');

  const request = await asked;

  expect(request.url()).toContain('/nodes/subgraph');
  expect(request.url()).toContain('depth=1');
  expect(request.url()).toContain(`rootId=${presentedId}`);

  // The click is the user choosing: the criterion switches to the one the
  // user picked.
  await expect(page.getByRole('radio', { name: 'El elegido a mano' })).toBeChecked();
  await expect(page.getByText('Criterio activo: El elegido a mano.')).toBeVisible();

  // The picture is still there: the canvas did not empty.
  await expect(canvas).toBeVisible();

  // The numbers of the picture are the truth: they agree with the list,
  // which is the text alternative of the canvas.
  const scope = page.locator('#explore-scope-count');
  await expect(scope).toContainText('La imagen tiene');

  const shown = await scopeNumber(page, /tiene (\d+)/);
  expect(shown).toBeGreaterThan(0);

  // The list follows the picture: it is the text alternative of the canvas.
  await openList(page);

  // The header row is not a node.
  await expect(nodeTable.getByRole('row')).toHaveCount(shown + 1);

  // The far nodes: the reader's choice, and the numbers say the truth.
  const toggle = page.getByRole('checkbox', { name: 'Solo el entorno del nodo' });
  await expect(toggle).not.toBeChecked();

  await toggle.click();

  await expect(scope).toContainText('quedan fuera del entorno del nodo presentado');

  const hidden = await scopeNumber(page, /(\d+) quedan/);
  const focused = await scopeNumber(page, /tiene (\d+)/);

  expect(focused + hidden).toBe(shown);

  // The list follows the picture: the nodes that are hidden are not in it.
  await expect(nodeTable.getByRole('row')).toHaveCount(focused + 1);
});

test('the list walks to a node too: it is the way a keyboard reaches it', async ({
  page,
  api
}) => {
  const nodes = await api.listNodes();

  expect(nodes.length).toBeGreaterThan(0);

  await page.goto('/');
  await waitForApp(page);

  await page.getByText('Explorar', { exact: true }).click();

  await openList(page);

  const nodeTable = page.getByRole('region', { name: 'Los nodos del subgrafo' });
  const walk = nodeTable.getByRole('button', { name: 'Caminar' }).first();

  await expect(walk).toBeVisible();

  const nodeId = await walk.getAttribute('data-node-id');

  expect(nodeId).toBeTruthy();

  const asked = page.waitForRequest((request) => request.url().includes('/nodes/subgraph'));

  await walk.click();

  const request = await asked;

  expect(request.url()).toContain(`rootId=${nodeId}`);
  expect(request.url()).toContain('depth=1');
});
