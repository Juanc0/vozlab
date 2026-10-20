import { fireEvent, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { json, renderGovernance } from './harness/governance';
import { PROPOSAL } from './fixtures/governance';
import { NODE_A } from './fixtures/graph';
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
  const label = screen.getByLabelText(/^Score: /);
  return Number(label.textContent?.trim());
}

/** The reads of the proposal screen, with the vote left to the caller. */
function stubFetch(vote: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.includes('/interactions')) {
      return vote(input, init);
    }
    if (url.includes('/proposals')) {
      return json({ proposals: [PROPOSAL], nextCursor: null });
    }
    if (url.includes('/discussions')) {
      return json({ threads: [], nextCursor: null });
    }
    if (url.includes('/nodes/')) {
      return json({ node: NODE_A });
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

describe('the optimistic vote', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('moves the score before the API answers', async () => {
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = () => resolve();
    });

    const fetchMock = stubFetch(async () => {
      await gate;
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
    });

    renderGovernance(Proposals, { authorHash: 'a'.repeat(64), fetch: fetchMock });

    await openProposal();

    expect(shownScore()).toBe(3);

    await fireEvent.click(screen.getByRole('button', { name: 'Upvote this proposal' }));

    // The score moved before the API answered.
    expect(shownScore()).toBe(4);

    release();

    await waitFor(() => {
      expect(screen.getByText(/Your vote was recorded/)).toBeInTheDocument();
    });
    expect(shownScore()).toBe(4);
  });

  it('rolls the score back when the API refuses the vote', async () => {
    const fetchMock = stubFetch(async () =>
      json(
        {
          code: 'ERR_DUPLICATE_INTERACTION',
          message: 'A vote already exists for this user and target'
        },
        409
      )
    );

    renderGovernance(Proposals, { authorHash: 'a'.repeat(64), fetch: fetchMock });

    await openProposal();

    await fireEvent.click(screen.getByRole('button', { name: 'Upvote this proposal' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('ERR_DUPLICATE_INTERACTION');
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A vote already exists for this user and target'
    );

    // The score is back to the value it had before the click.
    expect(shownScore()).toBe(3);
  });

  it('rolls the score back when the network fails', async () => {
    const fetchMock = stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });

    renderGovernance(Proposals, { authorHash: 'a'.repeat(64), fetch: fetchMock });

    await openProposal();

    await fireEvent.click(screen.getByRole('button', { name: 'Downvote this proposal' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    // The score is back to the value it had before the click.
    expect(shownScore()).toBe(3);
  });

  it('keeps the optimistic score when the vote is accepted', async () => {
    const fetchMock = stubFetch(async () =>
      json(
        {
          id: '99999999-9999-4999-8999-999999999999',
          targetId: PROPOSAL.id,
          targetType: 'PROPOSAL',
          interactionType: 'UPVOTE',
          value: 1
        },
        201
      )
    );

    renderGovernance(Proposals, { authorHash: 'a'.repeat(64), fetch: fetchMock });

    await openProposal();

    await fireEvent.click(screen.getByRole('button', { name: 'Upvote this proposal' }));

    await waitFor(() => {
      expect(screen.getByText(/Your vote was recorded/)).toBeInTheDocument();
    });

    expect(shownScore()).toBe(4);
  });

  it('adopts the score the server reports after the vote', async () => {
    // The API has no read for the interactions: a vote of the same type is
    // idempotent and does not move the counter again. The score of the
    // proposal is read back and adopted — the server is the authority.
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

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
      if (url.includes('/proposals/') && method === 'GET') {
        return json({ proposal: { ...PROPOSAL, communityScore: 1 } });
      }
      if (url.includes('/proposals')) {
        return json({ proposals: [PROPOSAL], nextCursor: null });
      }
      if (url.includes('/discussions')) {
        return json({ threads: [], nextCursor: null });
      }
      if (url.includes('/nodes/')) {
        return json({ node: NODE_A });
      }

      throw new Error(`unexpected request: ${method} ${url}`);
    });

    renderGovernance(Proposals, { authorHash: 'a'.repeat(64), fetch: fetchMock });

    await openProposal();

    await fireEvent.click(screen.getByRole('button', { name: 'Upvote this proposal' }));

    await waitFor(() => {
      expect(shownScore()).toBe(1);
    });
  });

  it('announces the state of the vote to the screen readers', async () => {    const fetchMock = stubFetch(async () =>
      json(
        {
          id: '99999999-9999-4999-8999-999999999999',
          targetId: PROPOSAL.id,
          targetType: 'PROPOSAL',
          interactionType: 'UPVOTE',
          value: 1
        },
        201
      )
    );

    renderGovernance(Proposals, { authorHash: 'a'.repeat(64), fetch: fetchMock });

    await openProposal();

    const upvote = screen.getByRole('button', { name: 'Upvote this proposal' });
    expect(upvote).toHaveAttribute('aria-pressed', 'false');

    await fireEvent.click(upvote);

    await waitFor(() => {
      expect(screen.getByText(/Your vote was recorded/)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Upvote this proposal' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
