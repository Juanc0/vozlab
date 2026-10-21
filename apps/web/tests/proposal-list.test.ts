import { fireEvent, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildProposalQuery } from '$lib/api/proposals';
import { json, renderGovernance, requestedUrls } from './harness/governance';
import { PROPOSAL } from './fixtures/governance';
import { NODE_B } from './fixtures/graph';
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

/** A second proposal of the workspace. */
const SECOND_PROPOSAL = {
  ...PROPOSAL,
  id: '15151515-1515-4151-8151-151515151515',
  justification: 'The description names the wrong faculty.'
};

describe('the proposal list', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('builds the query of the filters', () => {
    expect(buildProposalQuery({ status: 'PENDING', targetType: 'NODE', kind: 'EDIT' })).toEqual({
      status: 'PENDING',
      targetType: 'NODE',
      kind: 'EDIT',
      limit: 20
    });
  });

  it('drops an empty filter instead of sending it', () => {
    // The API validates the query: an empty `status` is not a status.
    expect(buildProposalQuery({ status: null, targetType: null, kind: null })).toEqual({
      limit: 20
    });
  });

  it('carries the cursor of the next page', () => {
    expect(buildProposalQuery({}, 20, 'cursor-2')).toEqual({ limit: 20, cursor: 'cursor-2' });
  });

  it('asks the API for the proposals of the workspace', async () => {
    const fetchMock = vi.fn(async () => json({ proposals: [PROPOSAL], nextCursor: null }));
    renderGovernance(Proposals, { fetch: fetchMock });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Propuesta de edición de nodo/i })).toBeInTheDocument();
    });

    expect(requestedUrls(fetchMock)[0]).toContain('/proposals?limit=20');
  });

  it('filters the list by status, target type and kind', async () => {
    const fetchMock = vi.fn(async () => json({ proposals: [PROPOSAL], nextCursor: null }));
    renderGovernance(Proposals, { fetch: fetchMock });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Propuesta de edición de nodo/i })).toBeInTheDocument();
    });

    await fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'PENDING' } });
    await waitFor(() => {
      expect(requestedUrls(fetchMock).some((url) => url.includes('status=PENDING'))).toBe(true);
    });

    await fireEvent.change(screen.getByLabelText('Objetivo'), { target: { value: 'EDGE' } });
    await waitFor(() => {
      expect(
        requestedUrls(fetchMock).some(
          (url) => url.includes('targetType=EDGE') && url.includes('status=PENDING')
        )
      ).toBe(true);
    });

    await fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'MERGE' } });
    await waitFor(() => {
      expect(
        requestedUrls(fetchMock).some(
          (url) => url.includes('kind=MERGE') && url.includes('status=PENDING')
        )
      ).toBe(true);
    });
  });

  it('pages through the next cursor', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes('/proposals')) {
        throw new Error(`unexpected request: ${url}`);
      }
      const calls = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/proposals'));
      return calls.length === 1
        ? json({ proposals: [PROPOSAL], nextCursor: 'cursor-2' })
        : json({ proposals: [SECOND_PROPOSAL], nextCursor: null });
    });

    renderGovernance(Proposals, { fetch: fetchMock });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Propuesta de edición de nodo/i })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Mostrar propuestas anteriores' }));

    await waitFor(() => {
      expect(requestedUrls(fetchMock).some((url) => url.includes('cursor=cursor-2'))).toBe(true);
    });

    // The second page is appended to the list.
    await waitFor(() => {
      expect(screen.getByText('The description names the wrong faculty.')).toBeInTheDocument();
    });
    expect(screen.getByText('The title names the wrong building.')).toBeInTheDocument();
  });

  it('shows the status of a proposal in the language of the interface', async () => {
    const rejected = {
      ...PROPOSAL,
      id: '16161616-1616-4161-8161-161616161616',
      status: 'REJECTED_BY_AUTHOR'
    };
    const fetchMock = vi.fn(async () => json({ proposals: [rejected], nextCursor: null }));
    renderGovernance(Proposals, { fetch: fetchMock });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Propuesta de edición de nodo/i })).toBeInTheDocument();
    });

    // The label of the status, not the value of the system.
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Rechazada por la autoría')).toBeInTheDocument();
    expect(table.queryByText('REJECTED_BY_AUTHOR')).not.toBeInTheDocument();
  });

  it('says so when no proposal matches', async () => {
    const fetchMock = vi.fn(async () => json({ proposals: [], nextCursor: null }));
    renderGovernance(Proposals, { fetch: fetchMock });

    await waitFor(() => {
      expect(screen.getByText(/Ninguna propuesta coincide con estos filtros/i)).toBeInTheDocument();
    });
  });

  it('shows the error of a failed read', async () => {
    const fetchMock = vi.fn(async () =>
      json({ code: 'ERR_INTERNAL_SERVER_ERROR', message: 'The database is unreachable' }, 500)
    );
    renderGovernance(Proposals, { fetch: fetchMock });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('ERR_INTERNAL_SERVER_ERROR');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('The database is unreachable');
  });

  it('opens a proposal and shows its delta field by field', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/proposals')) {
        return json({ proposals: [PROPOSAL], nextCursor: null });
      }
      if (url.includes('/discussions')) {
        return json({ threads: [], nextCursor: null });
      }
      if (url.includes('/nodes/')) {
        return json({ node: { ...NODE_B, id: PROPOSAL.targetId } });
      }
      throw new Error(`unexpected request: ${url}`);
    });

    renderGovernance(Proposals, { fetch: fetchMock });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Propuesta de edición de nodo/i })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: /Propuesta de edición de nodo/i }));

    await waitFor(() => {
      expect(screen.getByText('title')).toBeInTheDocument();
    });
    expect(screen.getByText('The campus shuttle leaves every 30 minutes')).toBeInTheDocument();
  });
});
