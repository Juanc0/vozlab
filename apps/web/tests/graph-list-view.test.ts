import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import GraphListView from '$lib/components/GraphListView.svelte';
import { ApiClient } from '$lib/api/client';
import { API_CLIENT_CONTEXT_KEY } from '$lib/state/context';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import { VoteLedger } from '$lib/governance/vote.svelte';
import { EDGE, EDGE_B, NODE_A, NODE_B } from './fixtures/graph';
import { contextWithLocale, localeContext } from './harness/locale';

describe('the list view of the subgraph', () => {
  it('lists every node with its type and its status', () => {
    render(GraphListView, { context: localeContext(), props: { nodes: [NODE_A, NODE_B], edges: [EDGE] } });

    const [nodeTable] = screen.getAllByRole('table');

    expect(within(nodeTable).getByRole('button', { name: NODE_A.title })).toBeInTheDocument();
    expect(within(nodeTable).getByRole('button', { name: NODE_B.title })).toBeInTheDocument();
    // The **display names** of the classes, in the language of the interface.
    expect(within(nodeTable).getByText('Problema')).toBeInTheDocument();
    expect(within(nodeTable).getByText('Idea')).toBeInTheDocument();
    // The **labels** of the statuses, not the values of the system.
    expect(within(nodeTable).getByText('Activo')).toBeInTheDocument();
    expect(within(nodeTable).getByText('Pendiente')).toBeInTheDocument();
  });

  it('lists every relation with its name and its endpoints', () => {
    render(GraphListView, { context: localeContext(), props: { nodes: [NODE_A, NODE_B], edges: [EDGE] } });

    const [, relationTable] = screen.getAllByRole('table');

    expect(within(relationTable).getByRole('rowheader', { name: 'Sugiere' })).toBeInTheDocument();
    expect(within(relationTable).getByRole('button', { name: NODE_A.title })).toBeInTheDocument();
    expect(within(relationTable).getByRole('button', { name: NODE_B.title })).toBeInTheDocument();
  });

  it('lists the attributes of every relation, in the format of the card', () => {
    render(GraphListView, { context: localeContext(), props: { nodes: [NODE_A, NODE_B], edges: [EDGE] } });

    const [, relationTable] = screen.getAllByRole('table');

    // The list is the text alternative of the canvas: the content of the
    // relation is here and not only in the picture.
    expect(within(relationTable).getByText('weight')).toBeInTheDocument();
    expect(within(relationTable).getByText('3')).toBeInTheDocument();
    expect(within(relationTable).getByText('source')).toBeInTheDocument();
    expect(within(relationTable).getByText('runbook')).toBeInTheDocument();
  });

  it('says so when a relation has no attributes', () => {
    render(GraphListView, { context: localeContext(), props: { nodes: [NODE_A, NODE_B], edges: [EDGE_B] } });

    const [, relationTable] = screen.getAllByRole('table');

    expect(
      within(relationTable).getByText('Este objeto no lleva ningún atributo.')
    ).toBeInTheDocument();
  });

  it('reports the selection of the node', () => {
    render(GraphListView, { context: localeContext(),
      props: { nodes: [NODE_A, NODE_B], edges: [EDGE], selection: { kind: 'node', id: NODE_B.id } }
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

  it('reports the selection of the relation', () => {
    render(GraphListView, { context: localeContext(),
      props: { nodes: [NODE_A, NODE_B], edges: [EDGE], selection: { kind: 'edge', id: EDGE.id } }
    });

    const [, relationTable] = screen.getAllByRole('table');

    expect(within(relationTable).getByRole('button', { name: 'Sugiere' })).toHaveAttribute(
      'aria-current',
      'true'
    );
  });

  it('selects the node when the user picks it in the list', async () => {
    const onselect = vi.fn();
    render(GraphListView, { context: localeContext(), props: { nodes: [NODE_A, NODE_B], edges: [EDGE], onselect } });

    const [nodeTable] = screen.getAllByRole('table');
    await fireEvent.click(within(nodeTable).getByRole('button', { name: NODE_B.title }));

    expect(onselect).toHaveBeenCalledWith({ kind: 'node', id: NODE_B.id });
  });

  it('selects the relation when the user picks it in the list', async () => {
    const onselect = vi.fn();
    render(GraphListView, { context: localeContext(), props: { nodes: [NODE_A, NODE_B], edges: [EDGE], onselect } });

    const [, relationTable] = screen.getAllByRole('table');
    await fireEvent.click(within(relationTable).getByRole('button', { name: 'Sugiere' }));

    expect(onselect).toHaveBeenCalledWith({ kind: 'edge', id: EDGE.id });
  });

  it('selects the endpoint of a relation when the user picks it', async () => {
    const onselect = vi.fn();
    render(GraphListView, { context: localeContext(), props: { nodes: [NODE_A, NODE_B], edges: [EDGE], onselect } });

    const [, relationTable] = screen.getAllByRole('table');
    await fireEvent.click(within(relationTable).getByRole('button', { name: NODE_A.title }));

    expect(onselect).toHaveBeenCalledWith({ kind: 'node', id: NODE_A.id });
  });

  it('says so when the subgraph holds no node and no relation', () => {
    render(GraphListView, { context: localeContext(), props: { nodes: [], edges: [] } });

    expect(screen.getByText('El subgrafo no tiene ningún nodo.')).toBeInTheDocument();
    expect(screen.getByText('El subgrafo no tiene ninguna relación.')).toBeInTheDocument();
  });

  it('is the other half of the workspace: it is not a disclosure any more', () => {
    const { container } = render(GraphListView, { context: localeContext(), props: { nodes: [NODE_A], edges: [] } });

    // The list is swapped with the canvas by the toggle of the toolbar:
    // there is nothing to collapse, and the page does not scroll.
    expect(container.querySelector('details')).toBeNull();
    expect(container.querySelector('summary')).toBeNull();

    // It says what it is.
    expect(
      screen.getByRole('heading', { name: 'El subgrafo en forma de lista' })
    ).toBeInTheDocument();
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
