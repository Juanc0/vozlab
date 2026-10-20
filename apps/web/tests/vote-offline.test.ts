import { fireEvent, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectivityState } from '$lib/pwa/connectivity.svelte';
import { VoteLedger } from '$lib/governance/vote.svelte';
import { json, renderGovernance, requestedUrls } from './harness/governance';
import { PROPOSAL } from './fixtures/governance';
import VoteButtons from '$lib/components/VoteButtons.svelte';
import Proposals from '../src/routes/(app)/proposals/+page.svelte';

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

const { pageState } = vi.hoisted(() => ({
  pageState: { url: new URL('http://localhost:5173/proposals') }
}));
vi.mock('$app/state', () => ({ page: pageState }));

const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto }));

/** The score the vote buttons show. */
function shownScore(): number {
  const group = screen.getByRole('group', { name: /vote on/i });
  const score = within(group).getByText(/^-?\d+$/);
  return Number(score.textContent?.trim());
}

/** The reads of the proposal screen; the vote is left to the caller. */
function stubFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes('/interactions')) {
      return json(
        {
          id: '99999999-9999-4999-8999-999999999999',
          targetId: PROPOSAL.id,
          targetType: 'PROPOSAL',
          interactionType: 'UPVOTE',
          value: 1
        },
        201
      );
    }
    if (url.includes('/proposals')) {
      return json({ proposals: [PROPOSAL], nextCursor: null });
    }
    if (url.includes('/discussions')) {
      return json({ threads: [], nextCursor: null });
    }
    if (url.includes('/nodes/')) {
      return json({ node: { id: PROPOSAL.targetId, title: 'A node' } });
    }

    throw new Error(`unexpected request: ${url}`);
  });
}

/** Opens the proposal of the list and waits for its review. */
async function openProposal(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /proposal node/i })).toBeInTheDocument();
  });

  await fireEvent.click(screen.getByRole('button', { name: /proposal node/i }));

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Upvote this proposal' })).toBeInTheDocument();
  });
}

describe('a vote that is refused offline', () => {
  beforeEach(() => {
    connectivityState.attach();
    window.dispatchEvent(new Event('online'));
  });

  afterEach(() => {
    window.dispatchEvent(new Event('online'));
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('never makes the vote optimistic: the score does not move at all', async () => {
    const ledger = new VoteLedger();
    const optimistic = vi.spyOn(ledger, 'applyOptimistic');
    const rollback = vi.spyOn(ledger, 'rollback');

    renderGovernance(
      VoteButtons,
      { fetch: stubFetch() },
      { ledger, targetId: PROPOSAL.id, targetType: 'PROPOSAL', score: 3 }
    );

    window.dispatchEvent(new Event('offline'));

    await fireEvent.click(screen.getByRole('button', { name: 'Upvote this item' }));

    // The request never left the app: the vote was never optimistic, so
    // there is nothing to roll back either.
    expect(optimistic).not.toHaveBeenCalled();
    expect(rollback).not.toHaveBeenCalled();
    expect(shownScore()).toBe(3);
  });

  it('says why the vote was refused', async () => {
    const ledger = new VoteLedger();

    renderGovernance(
      VoteButtons,
      { fetch: stubFetch() },
      { ledger, targetId: PROPOSAL.id, targetType: 'PROPOSAL', score: 3 }
    );

    window.dispatchEvent(new Event('offline'));

    await fireEvent.click(screen.getByRole('button', { name: 'Upvote this item' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('ERR_OFFLINE');
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/offline/i);
  });

  it('never sends the vote', async () => {
    const fetchMock = stubFetch();

    renderGovernance(
      VoteButtons,
      { fetch: fetchMock },
      { ledger: new VoteLedger(), targetId: PROPOSAL.id, targetType: 'PROPOSAL', score: 3 }
    );

    window.dispatchEvent(new Event('offline'));

    await fireEvent.click(screen.getByRole('button', { name: 'Upvote this item' }));

    expect(requestedUrls(fetchMock).some((url) => url.includes('/interactions'))).toBe(false);
  });

  it('leaves the score of the proposal untouched on the governance screen', async () => {
    const fetchMock = stubFetch();

    renderGovernance(Proposals, { authorHash: 'a'.repeat(64), fetch: fetchMock });

    await openProposal();
    expect(shownScore()).toBe(3);

    window.dispatchEvent(new Event('offline'));

    await fireEvent.click(screen.getByRole('button', { name: 'Upvote this proposal' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('ERR_OFFLINE');
    });

    expect(shownScore()).toBe(3);
    expect(requestedUrls(fetchMock).some((url) => url.includes('/interactions'))).toBe(false);
  });

  it('votes again once the browser is back', async () => {
    const fetchMock = stubFetch();

    renderGovernance(
      VoteButtons,
      { fetch: fetchMock },
      { ledger: new VoteLedger(), targetId: PROPOSAL.id, targetType: 'PROPOSAL', score: 3 }
    );

    window.dispatchEvent(new Event('offline'));
    await fireEvent.click(screen.getByRole('button', { name: 'Upvote this item' }));

    window.dispatchEvent(new Event('online'));
    await fireEvent.click(screen.getByRole('button', { name: 'Upvote this item' }));

    await waitFor(() => {
      expect(requestedUrls(fetchMock).some((url) => url.includes('/interactions'))).toBe(true);
    });
    expect(shownScore()).toBe(4);
  });
});
