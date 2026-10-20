import { fireEvent, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deltaEntries, formatDeltaValue, readMergeTarget } from '$lib/governance/delta';
import { json, renderGovernance } from './harness/governance';
import { BROKEN_MERGE_PROPOSAL, MERGE_PROPOSAL } from './fixtures/governance';
import { NODE_A, NODE_B } from './fixtures/graph';
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

/** The stub of the reads of the proposal screen. */
function stubFetch(proposal: typeof MERGE_PROPOSAL) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes('/proposals')) {
      return json({ proposals: [proposal], nextCursor: null });
    }
    if (url.includes('/discussions')) {
      return json({ threads: [], nextCursor: null });
    }
    if (url.includes(`/nodes/${NODE_A.id}`)) {
      return json({ node: NODE_A });
    }
    if (url.includes(`/nodes/${NODE_B.id}`)) {
      return json({ node: NODE_B });
    }

    throw new Error(`unexpected request: ${url}`);
  });
}

describe('the delta of a proposal', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lists the fields of the payload', () => {
    expect(deltaEntries({ title: 'A title', description: 'A description' })).toEqual([
      { field: 'description', value: 'A description' },
      { field: 'title', value: 'A title' }
    ]);
  });

  it('renders a value as a readable string', () => {
    expect(formatDeltaValue('a title')).toBe('a title');
    expect(formatDeltaValue(42)).toBe('42');
    expect(formatDeltaValue(false)).toBe('false');
    expect(formatDeltaValue(null)).toBe('—');
    expect(formatDeltaValue({ a: 1 })).toBe('{"a":1}');
  });

  it('narrows the payload of a merge proposal', () => {
    expect(readMergeTarget({ mergeIntoNodeId: NODE_A.id })).toEqual({
      kind: 'node',
      mergeIntoNodeId: NODE_A.id
    });
  });

  it('reports a malformed payload of a merge proposal', () => {
    const target = readMergeTarget({ mergeIntoNodeId: 'not-a-uuid' });

    expect(target.kind).toBe('invalid');
    expect(target.kind === 'invalid' && target.reason).toContain('mergeIntoNodeId');
  });

  it('renders the delta of an edit proposal field by field', async () => {
    const proposal = {
      ...MERGE_PROPOSAL,
      kind: 'EDIT' as const,
      proposedChanges: { title: 'The campus shuttle leaves every 30 minutes', attributes: { building: 'B3' } }
    };

    const fetchMock = stubFetch(proposal);
    renderGovernance(Proposals, { fetch: fetchMock });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Propuesta de edición de nodo/i })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: /Propuesta de edición de nodo/i }));

    await waitFor(() => {
      expect(screen.getByText('title')).toBeInTheDocument();
    });

    expect(screen.getByText('The campus shuttle leaves every 30 minutes')).toBeInTheDocument();
    // The nested attribute is rendered field by field too.
    expect(screen.getByText('attributes')).toBeInTheDocument();
    expect(screen.getByText('building')).toBeInTheDocument();
    expect(screen.getByText('B3')).toBeInTheDocument();
  });

  it('names the surviving node of a merge proposal', async () => {
    const fetchMock = stubFetch(MERGE_PROPOSAL);
    renderGovernance(Proposals, { fetch: fetchMock });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Propuesta de fusión de nodo/i })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: /Propuesta de fusión de nodo/i }));

    await waitFor(() => {
      expect(screen.getByText(NODE_A.title)).toBeInTheDocument();
    });

    // The surviving node is named with its uuid too (in the merge paragraph
    // and in the payload it carries).
    expect(screen.getAllByText(NODE_A.id).length).toBeGreaterThan(0);
  });

  it('does not break on a malformed payload of a merge proposal', async () => {
    const fetchMock = stubFetch(BROKEN_MERGE_PROPOSAL);
    renderGovernance(Proposals, { fetch: fetchMock });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Propuesta de fusión de nodo/i })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: /Propuesta de fusión de nodo/i }));

    await waitFor(() => {
      expect(screen.getByText(/no nombra ningún nodo que sobrevive/i)).toBeInTheDocument();
    });

    // The rest of the review still works.
    expect(screen.getByRole('heading', { name: 'Propuesta de fusión' })).toBeInTheDocument();
    expect(screen.getByText('mergeIntoNodeId')).toBeInTheDocument();
    expect(screen.getByText('not-a-uuid')).toBeInTheDocument();
  });
});
