import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import GraphListView from '$lib/components/GraphListView.svelte';
import { ApiClient } from '$lib/api/client';
import { API_CLIENT_CONTEXT_KEY } from '$lib/state/context';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import { VoteLedger } from '$lib/governance/vote.svelte';
import { EDGE, NODE_A, NODE_B } from './fixtures/graph';
import { contextWithLocale, localeContext } from './harness/locale';

describe('the list view of the subgraph', () => {
  it('lists every node with its type and its status', () => {
    render(GraphListView, { context: localeContext(), props: { nodes: [NODE_A, NODE_B], edges: [EDGE] } });

    const [nodeTable] = screen.getAllByRole('table');

    expect(within(nodeTable).getByRole('button', { name: NODE_A.title })).toBeInTheDocument();
    expect(within(nodeTable).getByRole('button', { name: NODE_B.title })).toBeInTheDocument();
    expect(within(nodeTable).getByText('Problem')).toBeInTheDocument();
    expect(within(nodeTable).getByText('Idea')).toBeInTheDocument();
    expect(within(nodeTable).getByText('ACTIVE')).toBeInTheDocument();
    expect(within(nodeTable).getByText('PENDING')).toBeInTheDocument();
  });

  it('lists every relation with its key and its endpoints', () => {
    render(GraphListView, { context: localeContext(), props: { nodes: [NODE_A, NODE_B], edges: [EDGE] } });

    const [, relationTable] = screen.getAllByRole('table');

    expect(within(relationTable).getByRole('rowheader', { name: 'SUGGESTS' })).toBeInTheDocument();
    expect(within(relationTable).getByRole('button', { name: NODE_A.title })).toBeInTheDocument();
    expect(within(relationTable).getByRole('button', { name: NODE_B.title })).toBeInTheDocument();
  });

  it('reports the selection of the node', () => {
    render(GraphListView, { context: localeContext(),
      props: { nodes: [NODE_A, NODE_B], edges: [EDGE], selectedNodeId: NODE_B.id }
    });

    const [nodeTable] = screen.getAllByRole('table');

    expect(within(nodeTable).getByRole('button', { name: NODE_B.title })).toHaveAttribute(
      'aria-current',
      'true'
    );
    expect(within(nodeTable).getByRole('button', { name: NODE_A.title })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('selects the node when the user picks it in the list', async () => {
    const onselect = vi.fn();
    render(GraphListView, { context: localeContext(), props: { nodes: [NODE_A, NODE_B], edges: [EDGE], onselect } });

    const [nodeTable] = screen.getAllByRole('table');
    await fireEvent.click(within(nodeTable).getByRole('button', { name: NODE_B.title }));

    expect(onselect).toHaveBeenCalledWith(NODE_B.id);
  });

  it('selects the endpoint of a relation when the user picks it', async () => {
    const onselect = vi.fn();
    render(GraphListView, { context: localeContext(), props: { nodes: [NODE_A, NODE_B], edges: [EDGE], onselect } });

    const [, relationTable] = screen.getAllByRole('table');
    await fireEvent.click(within(relationTable).getByRole('button', { name: NODE_A.title }));

    expect(onselect).toHaveBeenCalledWith(NODE_A.id);
  });

  it('says so when the subgraph holds no node and no relation', () => {
    render(GraphListView, { context: localeContext(), props: { nodes: [], edges: [] } });

    expect(screen.getByText('El subgrafo no tiene ningún nodo.')).toBeInTheDocument();
    expect(screen.getByText('El subgrafo no tiene ninguna relación.')).toBeInTheDocument();
  });

  it('is a disclosure: the long list can be collapsed', () => {
    const { container } = render(GraphListView, { context: localeContext(), props: { nodes: [NODE_A], edges: [] } });

    const details = container.querySelector('details');

    expect(details).not.toBeNull();
    expect(details?.open).toBe(true);
    expect(details?.querySelector('summary')?.textContent).toContain('El subgrafo en forma de lista');
  });

  it('offers no vote on a relation without a ledger', () => {
    render(GraphListView, { context: localeContext(), props: { nodes: [NODE_A, NODE_B], edges: [EDGE] } });

    const [, relationTable] = screen.getAllByRole('table');

    expect(within(relationTable).queryByRole('button', { name: /votar a favor/i })).not.toBeInTheDocument();
  });

  it('offers the optimistic vote on a relation when a ledger is given', () => {
    render(GraphListView, {
      props: {
        nodes: [NODE_A, NODE_B],
        edges: [EDGE],
        ledger: new VoteLedger()
      },
      context: contextWithLocale([
        [
          API_CLIENT_CONTEXT_KEY,
          new ApiClient({
            baseUrl: 'http://localhost:3000/api/v1',
            session: new SessionState(),
            workspace: new WorkspaceState()
          })
        ]
      ])
    });

    const [, relationTable] = screen.getAllByRole('table');

    expect(
      within(relationTable).getByRole('button', { name: /votar a favor/i })
    ).toBeInTheDocument();
    expect(
      within(relationTable).getByRole('button', { name: /votar en contra/i })
    ).toBeInTheDocument();
  });
});
