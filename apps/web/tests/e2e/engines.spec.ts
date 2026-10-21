/**
 * Journey — the comparison of the engines.
 *
 * The comparison is a **development** surface: it only exists in a
 * development build. The journey says the two things that matter about it:
 * the five panels draw the **same** picture, and the list — the text
 * alternative of the pictures — is one click away.
 */

import { waitForApp } from './support/app';
import { expect, test } from './support/fixtures';

test('the five engines draw the same picture, and the list is the alternative', async ({
  page,
  api
}) => {
  // A node of its own: the picture of the comparison is the window of the
  // workspace, and it must not be empty.
  await api.createNode({ typeKey: 'Problem', title: `${api.marker} comparison node` });

  await page.goto('/engines');
  await waitForApp(page);

  // The comparison is there: the heading says what it is.
  await expect(
    page.getByRole('heading', { name: 'Los motores, lado a lado' })
  ).toBeVisible();

  // The five pictures, each one with a name of its own.
  const dagre = page.getByRole('img', { name: /Cytoscape \+ dagre/ });
  const d3 = page.getByRole('img', { name: /Cytoscape \+ d3-force/ });
  const dag = page.getByRole('img', { name: /Cytoscape \+ d3-dag/ });
  const fcose = page.getByRole('img', { name: /Cytoscape \+ fcose/ });
  const sigma = page.getByRole('img', { name: /Sigma\.js \+ Graphology/ });

  await expect(dagre).toBeVisible();
  await expect(d3).toBeVisible();
  await expect(dag).toBeVisible();
  await expect(fcose).toBeVisible();

  // Sigma draws with WebGL: a browser that cannot draw it says so
  // instead of leaving a blank space.
  if ((await sigma.count()) === 0) {
    await expect(page.getByRole('alert')).toBeVisible();
  } else {
    await expect(sigma).toBeVisible();
  }

  // The **same** data in the five: the badges are the nodes of the
  // picture, and there are as many in one panel as in the other.
  const badges = page.getByRole('toolbar', { name: 'Los nodos de la ventana' });
  await expect(badges).toHaveCount(5);

  const counts = await badges.evaluateAll((layers) =>
    layers.map((layer) => layer.querySelectorAll('button').length)
  );

  expect(counts[0]).toBeGreaterThan(0);
  expect(new Set(counts).size).toBe(1);

  // The list is the text alternative of the five pictures.
  await page.getByRole('button', { name: 'Ver la lista' }).click();

  const table = page.getByRole('region', { name: 'Los nodos del subgrafo' });
  await expect(table).toBeVisible();

  const rows = await table.getByRole('row').count();

  // The rows of the list are the nodes of the picture, plus the header.
  expect(rows - 1).toBe(counts[0]);
});
