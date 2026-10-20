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
  await page.getByLabel('New thread').fill(`${api.marker} thread`);
  await page.getByRole('button', { name: 'Start the thread' }).click();
  await expect(page.getByRole('button', { name: `${api.marker} thread` })).toBeVisible();

  // The comment is posted.
  const comment = `${api.marker} first comment`;
  await page.getByLabel('Write a comment').fill(comment);
  await page.getByRole('button', { name: 'Post the comment' }).click();
  await expect(page.getByText(comment, { exact: true })).toBeVisible();

  // The reply is written under its parent.
  await page
    .getByRole('listitem')
    .filter({ hasText: comment })
    .getByRole('button', { name: 'Reply' })
    .click();

  await expect(page.getByLabel('Write a reply')).toBeVisible();

  const reply = `${api.marker} nested reply`;
  await page.getByLabel('Write a reply').fill(reply);
  await page.getByRole('button', { name: 'Post the reply' }).click();

  await expect(page.getByText(reply, { exact: true })).toBeVisible();

  // The reply belongs to the comment it answers: it is inside its item.
  const parent = page.getByRole('listitem').filter({ hasText: comment });
  await expect(parent.getByText(reply, { exact: true })).toBeVisible();
});
