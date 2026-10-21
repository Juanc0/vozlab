/**
 * Journey 2 — the graph.
 *
 * The nodes of the workspace are listed, picking one draws its **bounded**
 * subgraph, the list view says the same as the canvas, and the bound of the
 * window (3 hops, 200 nodes) is stated to the user.
 */

import { canvasDescription, openList, waitForApp } from './support/app';
import { expect, test } from './support/fixtures';

test('the graph lists the nodes, draws the bounded subgraph and states its bound', async ({
  page,
  api
}) => {
  // The graph of the test: a problem, an idea and the relation between them.
  // The relation respects the ontology (RELATES_TO goes from a Problem to an
  // Idea), so the API accepts it.
  const root = await api.createNode({ typeKey: 'Problem', title: `${api.marker} graph root` });
  const idea = await api.createNode({ typeKey: 'Idea', title: `${api.marker} graph idea` });
  await api.createEdge({
    sourceNodeId: root.id,
    targetNodeId: idea.id,
    relationKey: 'RELATES_TO'
  });

  await page.goto('/');
  await waitForApp(page);

  // The nodes of the workspace are listed.
  await expect(page.getByRole('button', { name: root.title })).toBeVisible();

  // The bound of the window is stated, not implied.
  await expect(
    page.getByText('La API acota la ventana a 3 saltos y 200 nodos')
  ).toBeVisible();

  // Picking a node draws its subgraph.
  await page.getByRole('button', { name: root.title }).click();

  const canvas = page.getByRole('img', { name: 'Lienzo del subgrafo' });
  await expect(canvas).toBeVisible();

  // The canvas says what it shows; the list view must say the same.
  const description = await canvasDescription(page, 'Lienzo del subgrafo');

  const counted = /(\d+) nodos y (\d+) relaciones/.exec(description);
  expect(counted).not.toBeNull();

  const nodeCount = counted?.[1] ?? '';
  const relationCount = counted?.[2] ?? '';

  // The list is the text alternative of the canvas, and it is one click
  // away.
  await openList(page);

  await expect(
    page.getByRole('heading', { name: `Nodos del subgrafo (${nodeCount})`, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: `Relaciones del subgrafo (${relationCount})`, exact: true })
  ).toBeVisible();

  // The list view lists the same nodes and relations as the canvas.
  const nodeTable = page.getByRole('region', { name: 'Los nodos del subgrafo' });
  await expect(nodeTable.getByRole('button', { name: root.title })).toBeVisible();
  await expect(nodeTable.getByRole('button', { name: idea.title })).toBeVisible();

  const relationTable = page.getByRole('region', { name: 'Las relaciones del subgrafo' });
  // The **display name** of the relation, in the language of the interface:
  // the key of the system (`RELATES_TO`) is not what the reader reads.
  await expect(relationTable.getByRole('rowheader', { name: 'Se relaciona con' })).toBeVisible();
  await expect(relationTable.getByRole('button', { name: root.title })).toBeVisible();
  await expect(relationTable.getByRole('button', { name: idea.title })).toBeVisible();
});
