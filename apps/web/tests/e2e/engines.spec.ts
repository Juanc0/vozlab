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

  // The engines are a **tablist**: three tabs, one of them selected.
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(3);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');

  // The first engine is on screen, and it is the **only** picture. A
  // hierarchy does not breathe, and the interface says so.
  await expect(page.getByRole('img', { name: /Cytoscape \+ dagre/ })).toBeVisible();
  await expect(page.getByRole('img')).toHaveCount(1);
  await expect(page.getByTestId('hierarchy-note')).toHaveText(
    'Una jerarquía no respira: sus rangos son el dibujo.'
  );

  // The keyboard moves between the tabs, and the engine that is chosen
  // takes over the same space.
  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');

  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('img', { name: /Cytoscape \+ d3-force/ })).toBeVisible();
  await expect(page.getByRole('img')).toHaveCount(1);

  // The living spring says it is alive and moves at rest: it is never
  // called settled, and no hierarchy note is shown for it.
  const growReadout = page.getByRole('region', { name: 'Las medidas del motor' });
  await expect(growReadout.getByTestId('alive-note')).toBeVisible();
  await expect(growReadout.getByText(/Viva: se mueve en reposo|Despierta/)).toBeVisible();
  await expect(page.getByTestId('hierarchy-note')).toHaveCount(0);

  // The third tab is the **clone** of dagre: the layered arrangement of
  // `d3-dag`. The library is a dependency of the comparison alone — the
  // picture of the app never imports it — and the comparison hands the
  // clone over to the picture it mounts.
  await page.getByRole('tab', { name: 'Cytoscape + d3-dag' }).click();

  await expect(page.getByRole('img', { name: /Cytoscape \+ d3-dag/ })).toBeVisible();
  await expect(page.getByRole('img')).toHaveCount(1);
  await expect(page.getByTestId('hierarchy-note')).toBeVisible();

  const readout = page.getByRole('region', { name: 'Las medidas del motor' });

  // The time the arrangement took.
  await expect(readout.getByText(/ms en total/)).toBeVisible();

  // The relations the arrangement had to reverse to order the graph: a
  // **number**, and not the dash of an engine that does not report them.
  const reversed = readout
    .locator('dt', { hasText: 'Relaciones invertidas' })
    .locator('xpath=following-sibling::dd[1]');

  await expect(reversed).toHaveText(/^\d+ relaciones$/);

  // The deprecated engines are gone: no tab, no copy, no canvas.
  await expect(page.getByRole('tab', { name: /Sigma|fcose/ })).toHaveCount(0);

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
