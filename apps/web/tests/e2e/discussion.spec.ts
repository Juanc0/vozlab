/**
 * Journey 5 — the discussion of an object.
 *
 * A thread is opened for a node, a comment is posted, and a reply lands
 * **under its parent** — the nesting is what the reader sees, not an
 * implementation detail.
 */

import { waitForApp } from './support/app';
import { expect, test } from './support/fixtures';

test('a thread is opened, a comment is posted and a reply lands under its parent', async ({
  page,
  api
}) => {
  const node = await api.createNode({ typeKey: 'Problem', title: `${api.marker} discussion target` });

  await page.goto(`/discussions?target=${node.id}&type=NODE`);
  await waitForApp(page);

  // The thread is opened.
  await page.getByLabel('Hilo nuevo').fill(`${api.marker} thread`);
  await page.getByRole('button', { name: 'Abrir el hilo' }).click();
  await expect(page.getByRole('button', { name: `${api.marker} thread` })).toBeVisible();

  // The comment is posted.
  const comment = `${api.marker} first comment`;
  await page.getByLabel('Escribe un comentario').fill(comment);
  await page.getByRole('button', { name: 'Publicar el comentario' }).click();
  await expect(page.getByText(comment, { exact: true })).toBeVisible();

  // The reply is written under its parent.
  await page
    .getByRole('listitem')
    .filter({ hasText: comment })
    .getByRole('button', { name: 'Responder' })
    .click();

  await expect(page.getByLabel('Escribe una respuesta')).toBeVisible();

  const reply = `${api.marker} nested reply`;
  await page.getByLabel('Escribe una respuesta').fill(reply);
  await page.getByRole('button', { name: 'Publicar la respuesta' }).click();

  await expect(page.getByText(reply, { exact: true })).toBeVisible();

  // The reply belongs to the comment it answers: it is inside its item.
  const parent = page.getByRole('listitem').filter({ hasText: comment });
  await expect(parent.getByText(reply, { exact: true })).toBeVisible();
});
