/**
 * Journey — the comparison of the engines.
 *
 * The comparison is a **development** surface: it only exists in a
 * development build. The journey says the things that matter about it: the
 * engines are **tabs of one workspace** — one at a time, in the same space —
 * the keyboard moves between them, the list is the text alternative of the
 * picture, and the chrome folds so the picture is the picture.
 */

import { waitForApp } from './support/app';
import { expect, test } from './support/fixtures';

test('the engines are tabs of one workspace, and the chrome folds so the picture is the picture', async ({
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

  // The engines are a **tablist**: four tabs, one of them selected.
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(4);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');

  // The first engine is on screen, and it is the **only** picture. A
  // hierarchy does not breathe, and the interface says so.
  await expect(page.getByRole('img', { name: /Cytoscape \+ dagre/ })).toBeVisible();
  await expect(page.getByRole('img')).toHaveCount(1);
  await expect(page.getByTestId('hierarchy-note')).toHaveText(
    'Una jerarquía no respira: sus rangos son el dibujo.'
  );

  // The essay is onboarding: it starts folded, it opens on request, and it
  // closes again. The control announces the state.
  const essayToggle = page.getByRole('button', { name: '¿Qué es esto?' });
  const essay = page.getByText(/Un mismo espacio para los cuatro motores/);

  await expect(essayToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(essay).toBeHidden();

  await essayToggle.click();

  await expect(essayToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(essay).toBeVisible();

  await essayToggle.click();

  await expect(essayToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(essay).toBeHidden();

  // The readout starts folded. Its header always carries the name of the
  // engine and the three numbers that answer the question at a glance.
  const readout = page.getByRole('region', { name: 'Las medidas del motor' });
  const measurements = readout.getByRole('button', { name: 'Todas las medidas' });
  const kpis = readout.getByTestId('readout-kpis');

  await expect(measurements).toHaveAttribute('aria-expanded', 'false');
  await expect(readout.getByRole('heading', { name: 'Cytoscape + dagre' })).toBeVisible();
  await expect(kpis).toBeVisible();
  await expect(kpis.getByText('Marco')).toBeVisible();
  await expect(kpis.getByText('Tarjetas encima')).toBeVisible();
  await expect(kpis.getByText('Estado')).toBeVisible();
  await expect(kpis.getByText('Asentada')).toBeVisible();

  // The table of twelve rows is behind the fold.
  await expect(readout.getByText('Disposición', { exact: true })).toBeHidden();

  // The frame is a real number once the engine has been measured: the
  // button lives in the toolbar and the header follows it.
  await page.getByRole('button', { name: 'Medir el motor' }).click();
  await expect(kpis.getByText(/\d+[.,]\d+ ms/)).toBeVisible();

  // The size select never renders an empty value, even when the window of
  // the workspace is not one of the presets: the window is an option of its
  // own and the selected one names it.
  const size = page.getByLabel('Tamaño de la imagen');

  await expect(size).not.toHaveValue('');

  const selectedSize = await size.locator('option:checked').textContent();

  expect(selectedSize).toMatch(/La demostración \(\d[\d.,]* nodos\)/);

  // The counts of the picture say the same number.
  await expect(
    page.getByText(/^\d[\d.,]* nodos · \d[\d.,]* relaciones$/)
  ).toBeVisible();

  // The fold expands the table, announces it, and it stays open when the
  // reader moves to another engine: one fold for the whole surface.
  await measurements.click();

  await expect(measurements).toHaveAttribute('aria-expanded', 'true');
  await expect(readout.getByText('Disposición', { exact: true })).toBeVisible();

  // The keyboard moves between the tabs, and the engine that is chosen
  // takes over the same space.
  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');

  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('img', { name: /Cytoscape \+ d3-force/ })).toBeVisible();
  await expect(page.getByRole('img')).toHaveCount(1);

  // The fold survived the tab switch.
  await expect(measurements).toHaveAttribute('aria-expanded', 'true');

  // The living spring says it is alive and moves at rest: it is never
  // called settled, and no hierarchy note is shown for it.
  const growReadout = readout;
  await expect(growReadout.getByTestId('alive-note')).toBeVisible();
  await expect(growReadout.getByText(/Viva: se mueve en reposo|Despierta/)).toBeVisible();
  await expect(kpis.getByText('Viva')).toBeVisible();
  await expect(page.getByTestId('hierarchy-note')).toHaveCount(0);

  // The third tab is the **SVG painter**: the same living spring, drawn by
  // hand. The picture is a `<svg>` whose cards are groups — there is no
  // canvas and no `<img>` — and the readout carries the numbers of the
  // painter: the build of the picture and the elements it put in the DOM.
  await page.keyboard.press('ArrowRight');

  await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-engine-picture="svg"]')).toBeVisible();
  await expect(page.getByRole('img')).toHaveCount(0);
  await expect(page.locator('g.vozlab-svg-card').first()).toBeVisible();

  const svgReadout = page.getByRole('region', { name: 'Las medidas del motor' });
  await expect(svgReadout.getByTestId('alive-note')).toBeVisible();
  await expect(svgReadout.getByText('Construcción de la imagen')).toBeVisible();
  await expect(svgReadout.getByText(/\d+[.,]\d{2} ms en construirla/)).toBeVisible();
  await expect(svgReadout.getByText('Elementos de la imagen')).toBeVisible();
  await expect(svgReadout.getByText(/\d[\d.,]* elementos/)).toBeVisible();
  await expect(page.getByTestId('hierarchy-note')).toHaveCount(0);

  // The cards are controls: they take the focus, the ring says so, and the
  // keyboard selects and expands them.
  const card = page.locator('g.vozlab-svg-card').first();

  await card.focus();
  await expect(card).toBeFocused();
  await expect(card.locator('rect.vozlab-svg-ring')).toHaveAttribute('opacity', '1');

  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('e');
  await expect(card).toHaveAttribute('aria-expanded', 'true');

  // The fourth tab is the **clone** of dagre: the layered arrangement of
  // `d3-dag`. The library is a dependency of the comparison alone — the
  // picture of the app never imports it — and the comparison hands the
  // clone over to the picture it mounts.
  await page.getByRole('tab', { name: 'Cytoscape + d3-dag' }).click();

  await expect(page.getByRole('img', { name: /Cytoscape \+ d3-dag/ })).toBeVisible();
  await expect(page.getByRole('img')).toHaveCount(1);
  await expect(page.getByTestId('hierarchy-note')).toBeVisible();

  const readoutOfDag = page.getByRole('region', { name: 'Las medidas del motor' });

  // The time the arrangement took.
  await expect(readoutOfDag.getByText(/ms en total/)).toBeVisible();

  // The relations the arrangement had to reverse to order the graph: a
  // **number**, and not the dash of an engine that does not report them.
  const reversed = readoutOfDag
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

test('at 375 the folded chrome leaves the picture the room', async ({ page, api }) => {
  await api.createNode({ typeKey: 'Problem', title: `${api.marker} narrow node` });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/engines');
  await waitForApp(page);

  // The notice of the shell is a toast over the picture on a phone: it
  // belongs to the shell, not to the comparison, and it would cover the
  // readout. It is dismissed before the geometry is read.
  const dismissed = page.getByRole('button', { name: 'Entendido' });

  if ((await dismissed.count()) > 0) {
    await dismissed.click();
  }

  const readout = page.getByRole('region', { name: 'Las medidas del motor' });
  const measurements = readout.getByRole('button', { name: 'Todas las medidas' });
  const kpis = readout.getByTestId('readout-kpis');

  // It starts folded, with the three numbers on one line.
  await expect(kpis).toBeVisible();
  await expect(measurements).toHaveAttribute('aria-expanded', 'false');
  await expect(readout.getByText('Disposición', { exact: true })).toBeHidden();

  const readoutBox = await readout.boundingBox();

  expect(readoutBox).not.toBeNull();
  // One line: the padding and the 44 px control of the fold.
  expect(readoutBox?.height ?? 0).toBeLessThanOrEqual(72);

  // The touch target of the fold keeps the size of a finger.
  const toggleBox = await measurements.boundingBox();

  expect(toggleBox).not.toBeNull();
  expect(toggleBox?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(toggleBox?.height ?? 0).toBeGreaterThanOrEqual(44);

  // The chrome does not meet in the middle: the picture keeps a real area
  // between the toolbar and the readout.
  const toolbar = page.getByRole('region', { name: 'La barra de los motores' });
  const toolbarBox = await toolbar.boundingBox();

  expect(toolbarBox).not.toBeNull();
  expect((readoutBox?.y ?? 0) - ((toolbarBox?.y ?? 0) + (toolbarBox?.height ?? 0))).toBeGreaterThan(
    320
  );

  // The picture is still the picture.
  await expect(page.getByRole('img', { name: /Cytoscape \+ dagre/ })).toBeVisible();

  // And the fold works at 375 too: the table opens and announces it.
  await measurements.click();

  await expect(measurements).toHaveAttribute('aria-expanded', 'true');
  await expect(readout.getByText('Disposición', { exact: true })).toBeVisible();
});

test('the living spring never stops while it is shown, and sleeps with the tab', async ({
  page,
  api
}) => {
  // A node of its own, so the picture is not empty.
  await api.createNode({ typeKey: 'Problem', title: `${api.marker} living node` });

  await page.goto('/engines');
  await waitForApp(page);

  await page.getByRole('tab', { name: 'SVG + d3' }).click();

  const card = page.locator('g[data-node-id]').first();

  await expect(card).toBeVisible();

  // The wake of the mount has cooled: what moves the picture now is the
  // **idle drift**, and it has to move it.
  await page.waitForTimeout(1600);

  const before = await card.getAttribute('transform');

  await page.waitForTimeout(1200);

  const after = await card.getAttribute('transform');

  // The picture is alive: it moves while it is on screen, with no reset and
  // no stop.
  expect(after).not.toBe(before);

  // The browser tab is hidden: nobody is looking at the picture.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden'
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await page.waitForTimeout(400);

  const hidden = await card.getAttribute('transform');

  await page.waitForTimeout(1200);

  // A hidden picture spends no frame: the place does not move.
  expect(await card.getAttribute('transform')).toBe(hidden);

  // It comes back where it was, and it moves again.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible'
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await page.waitForTimeout(1200);

  expect(await card.getAttribute('transform')).not.toBe(hidden);
});
