/**
 * Journey — the comparison of the engines.
 *
 * The comparison is a **development** surface: it only exists in a
 * development build. The journey says the three things that matter about
 * it: the engines are **tabs of one workspace** — one at a time, in the
 * same space — the keyboard moves between them, and the list is the text
 * alternative of the picture.
 */

import { waitForApp } from './support/app';
import { expect, test } from './support/fixtures';

test('the engines are tabs of one workspace: one at a time, and the list is the alternative', async ({
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
    page.getByRole('heading', { name: 'Los motores, de uno en uno' })
  ).toBeVisible();

  // The engines are a **tablist**: five tabs, one of them selected.
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(5);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');

  // The first engine is on screen, and it is the **only** picture.
  await expect(page.getByRole('img', { name: /Cytoscape \+ dagre/ })).toBeVisible();
  await expect(page.getByRole('img')).toHaveCount(1);

  // The keyboard moves between the tabs, and the engine that is chosen
  // takes over the same space.
  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');

  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('img', { name: /Cytoscape \+ d3-force/ })).toBeVisible();
  await expect(page.getByRole('img')).toHaveCount(1);

  // The last engine draws with WebGL: a browser that cannot draw it says
  // so instead of leaving a blank space.
  await page.keyboard.press('End');

  await expect(tabs.nth(4)).toHaveAttribute('aria-selected', 'true');

  const sigma = page.getByRole('img', { name: /Sigma\.js \+ Graphology/ });

  if ((await sigma.count()) === 0) {
    await expect(page.getByRole('alert')).toBeVisible();
  } else {
    await expect(sigma).toBeVisible();
    await expect(page.getByRole('img')).toHaveCount(1);
  }

  // The workspace is the window: the page does not scroll.
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)
    )
    .toBe(true);

  // The list is the text alternative of the picture.
  await page.getByRole('button', { name: 'Ver la lista' }).click();

  const table = page.getByRole('region', { name: 'Los nodos del subgrafo' });
  await expect(table).toBeVisible();

  const rows = await table.getByRole('row').count();

  // The rows of the list are the nodes of the picture, plus the header.
  expect(rows - 1).toBeGreaterThan(0);
});
