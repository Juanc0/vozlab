/**
 * Journey 6 — the vote.
 *
 * The score moves **before** the request leaves the app (the optimistic
 * update), and a vote the server refuses is rolled back to the exact value
 * it had, with the API's own code.
 *
 * The server is the authority: a **second vote of the other kind** for the
 * same user and the same target is refused with
 * `409 ERR_DUPLICATE_INTERACTION` (a repeat of the *same* kind is
 * idempotent and does not move the counter again).
 */

import { waitForApp } from './support/app';
import { expect, test } from './support/fixtures';

test('the score moves at once and a refused second vote is rolled back', async ({
  page,
  api
}) => {
  const node = await api.createNode({ typeKey: 'Problem', title: `${api.marker} vote target` });
  const justification = `${api.marker} vote justification`;

  await api.createProposal({
    targetId: node.id,
    targetType: 'NODE',
    proposedChanges: { title: `${api.marker} vote target` },
    justification
  });

  await page.goto('/proposals');
  await waitForApp(page);
  await page
    .getByRole('row')
    .filter({ hasText: justification })
    .getByRole('button', { name: 'Propuesta de edición de nodo' })
    .click();

  const group = page.getByRole('group', { name: 'Votar sobre esta propuesta' });
  const score = group.locator('span', { hasText: /^\d+$/ });
  await expect(score).toHaveText('0');

  // The request of a vote is **held in flight**: while it waits, only the
  // optimistic update of the app can move the score.
  let hold = false;
  let gate: Promise<void> = Promise.resolve();
  let release = (): void => {};

  await page.route('**/api/v1/interactions', async (route) => {
    if (hold) {
      await gate;
    }
    await route.continue();
  });

  /** Holds the next vote until the returned function is called. */
  function holdTheNextVote(): () => void {
    hold = true;
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    return () => {
      hold = false;
      release();
    };
  }

  // The first vote: the score moves at once, the request has not answered
  // yet.
  const releaseUpvote = holdTheNextVote();
  await page.getByRole('button', { name: 'Votar a favor de esta propuesta' }).click();
  await expect(score).toHaveText('1');
  releaseUpvote();

  await expect(page.getByText('Tu voto se ha registrado. La puntuación ahora es 1.')).toBeVisible();

  // The second vote is the other kind: it moves the score at once too, and
  // the server refuses it.
  const releaseDownvote = holdTheNextVote();
  await page.getByRole('button', { name: 'Votar en contra de esta propuesta' }).click();
  await expect(score).toHaveText('0');
  releaseDownvote();

  const alert = page.getByRole('alert').filter({ hasText: 'ERR_DUPLICATE_INTERACTION' });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('ERR_DUPLICATE_INTERACTION');

  // The refusal rolls the score back to the value it had before the vote.
  await expect(score).toHaveText('1');
});
