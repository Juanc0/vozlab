/**
 * Journey — the zoom of the picture and the walk that re-centres it.
 *
 * The zoom is a property of the **view**, and the view belongs to the
 * reader: the picture opens with the whole graph in view, the wheel changes
 * the zoom, and a walk moves the picture — smoothly — without touching the
 * value.
 *
 * The journey looks at what the reader sees: where the cards are drawn, how
 * the picture moves and what the numbers say.
 */

import type { Locator, Page } from '@playwright/test';
import { waitForApp } from './support/app';
import { expect, test } from './support/fixtures';

/** The canvas of the exploration view. */
function canvas(page: Page) {
  return page.getByRole('img', { name: 'Lienzo de la ventana de exploración' });
}

/** The zoom the picture is at, as the app tells it. */
async function zoom(page: Page): Promise<number> {
  const value = await canvas(page).getAttribute('data-zoom');

  if (value === null) {
    throw new Error('the canvas does not carry its zoom');
  }

  return Number(value);
}

/**
 * The place of an element, once the picture has come to rest.
 *
 * The picture is a simulation: it moves for a while after every change.
 * The journey waits for it to settle before it measures anything — a
 * measurement of a moving picture is a measurement of nothing.
 *
 * @param page - The page of the test.
 * @param locator - The element to measure.
 * @returns The box of the element.
 */
async function settledBox(page: Page, locator: Locator): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  let previous: { x: number; y: number } | null = null;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const box = await locator.boundingBox();

    if (box !== null) {
      if (
        previous !== null &&
        Math.abs(box.x - previous.x) < 0.5 &&
        Math.abs(box.y - previous.y) < 0.5
      ) {
        return box;
      }

      previous = { x: box.x, y: box.y };
    }

    await page.waitForTimeout(100);
  }

  const box = await locator.boundingBox();

  if (box === null) {
    throw new Error('the element has no box');
  }

  return box;
}

/**
 * The place of the card of a node.
 *
 * The badge of a node is a real button **over** the card, six pixels away
 * from its corner: the card is drawn where the badge says it is.
 *
 * @param page - The page of the test.
 * @param nodeId - The id of the node.
 * @param settle - Whether the picture has to come to rest before measuring.
 * @returns The centre of the card, in the coordinates of the page.
 */
async function cardCentre(
  page: Page,
  nodeId: string,
  settle = false
): Promise<{ x: number; y: number }> {
  const badge = page
    .getByRole('toolbar', { name: 'Los nodos de la ventana' })
    .locator(`[data-node-id="${nodeId}"]`);

  await expect(badge).toBeAttached();

  const width = Number(await badge.getAttribute('data-node-width'));
  const height = Number(await badge.getAttribute('data-node-height'));
  const box = settle ? await settledBox(page, badge) : await badge.boundingBox();

  if (box === null) {
    throw new Error(`the badge of the node ${nodeId} has no box`);
  }

  return {
    x: box.x + box.width / 2 - width / 2 - 6,
    y: box.y + box.height / 2 + height / 2 + 6
  };
}

/** The badge of the first node of the window. */
function firstBadge(page: Page) {
  return page.getByRole('toolbar', { name: 'Los nodos de la ventana' }).getByRole('button').first();
}

/** The id of the node the badge belongs to. */
async function nodeIdOf(badge: Locator): Promise<string> {
  await expect(badge).toBeAttached();

  const id = await badge.getAttribute('data-node-id');

  if (id === null) {
    throw new Error('the badge has no id');
  }

  return id;
}

test('the picture opens with the whole graph in view, and the wheel is the reader’s', async ({
  page,
  api
}) => {
  // The workspace holds nodes: there is a picture to open.
  const nodes = await api.listNodes();

  expect(nodes.length).toBeGreaterThan(0);

  await page.goto('/');
  await waitForApp(page);

  await page.getByText('Explorar', { exact: true }).click();

  const picture = canvas(page);

  await expect(picture).toBeVisible();

  // The picture is fitted: every card of the window is inside the box of
  // the canvas.
  await expect
    .poll(
      async () => {
        const box = await picture.boundingBox();

        if (box === null) {
          return 1;
        }

        const badges = page
          .getByRole('toolbar', { name: 'Los nodos de la ventana' })
          .getByRole('button');

        const count = await badges.count();

        if (count === 0) {
          return 1;
        }

        let inside = 0;

        for (let index = 0; index < count; index += 1) {
          const badge = await badges.nth(index).boundingBox();

          if (badge === null) {
            continue;
          }

          const within =
            badge.x >= box.x - 1 &&
            badge.y >= box.y - 1 &&
            badge.x + badge.width <= box.x + box.width + 1 &&
            badge.y + badge.height <= box.y + box.height + 1;

          if (within) {
            inside += 1;
          }
        }

        return count - inside;
      },
      { timeout: 15_000 }
    )
    .toBe(0);

  // The zoom is the fit, and it is a number the reader can change.
  const fit = await zoom(page);

  expect(fit).toBeGreaterThan(0);
  expect(fit).toBeLessThan(1);

  // The wheel changes it: the zoom belongs to the reader.
  const box = await picture.boundingBox();

  if (box === null) {
    throw new Error('the canvas has no box');
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);

  await expect.poll(async () => zoom(page)).not.toBe(fit);

  const chosen = await zoom(page);

  expect(chosen).toBeGreaterThan(fit);
});

test('a walk moves the picture smoothly and does not touch the zoom', async ({
  page,
  api
}) => {
  const nodes = await api.listNodes();

  expect(nodes.length).toBeGreaterThan(0);

  await page.goto('/');
  await waitForApp(page);

  await page.getByText('Explorar', { exact: true }).click();

  const picture = canvas(page);

  await expect(picture).toBeVisible();

  const badge = firstBadge(page);
  const target = await nodeIdOf(badge);

  // The reader chooses a zoom of their own.
  const box = await picture.boundingBox();

  if (box === null) {
    throw new Error('the canvas has no box');
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);

  await expect.poll(async () => zoom(page)).not.toBe(0);

  const chosen = await zoom(page);

  // The picture has come to rest: the click lands on the card the reader
  // means.
  const centre = await cardCentre(page, target, true);

  // The click asks for the neighbourhood of the node that was clicked.
  const asked = page.waitForRequest((request) => request.url().includes('/nodes/subgraph'));

  await page.mouse.click(centre.x, centre.y);

  const request = await asked;

  expect(request.url()).toContain(`rootId=${target}`);

  // The movement is seen: the picture is not in one place and then in
  // another one.
  const seen: string[] = [];

  for (let frame = 0; frame < 12; frame += 1) {
    const place = await cardCentre(page, target);

    seen.push(`${Math.round(place.x)},${Math.round(place.y)}`);

    await page.waitForTimeout(40);
  }

  expect(new Set(seen).size).toBeGreaterThan(1);

  // The picture ends centred on the node the reader walked to.
  await expect
    .poll(
      async () => {
        const place = await cardCentre(page, target, true);
        const canvasBox = await picture.boundingBox();

        if (canvasBox === null) {
          return 1000;
        }

        return Math.round(
          Math.hypot(
            place.x - (canvasBox.x + canvasBox.width / 2),
            place.y - (canvasBox.y + canvasBox.height / 2)
          )
        );
      },
      { timeout: 15_000 }
    )
    .toBeLessThan(40);

  // The zoom is the reader's: the walk did not touch it.
  expect(await zoom(page)).toBe(chosen);
});
