/**
 * The search of the graph.
 *
 * The field narrows the nodes as the reader types, says out loud what is
 * left, and takes the picture to the node the reader picks.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import NodeSearch from '$lib/components/NodeSearch.svelte';
import { localeContext } from './harness/locale';
import { NODE_A, NODE_B } from './fixtures/graph';

/** Renders the search with two nodes and a spy for the selection. */
function mount(onselect = vi.fn()): ReturnType<typeof vi.fn> {
  render(NodeSearch, {
    context: localeContext(),
    props: { nodes: [NODE_A, NODE_B], onselect }
  });

  return onselect;
}

describe('the search of the graph', () => {
  it('narrows the list to the nodes whose title matches', async () => {
    mount();

    const field = screen.getByLabelText('Buscar un nodo');

    await fireEvent.input(field, { target: { value: NODE_A.title } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: NODE_A.title })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: NODE_B.title })).not.toBeInTheDocument();
  });

  it('says how many nodes match', async () => {
    mount();

    await fireEvent.input(screen.getByLabelText('Buscar un nodo'), {
      target: { value: NODE_A.title }
    });

    await waitFor(() => {
      expect(document.querySelector('#vozlab-root-search-status')?.textContent).toContain(
        'Nodos que coinciden:'
      );
    });
  });

  it('turns an impossible query into a sentence, not an error', async () => {
    mount();

    await fireEvent.input(screen.getByLabelText('Buscar un nodo'), {
      target: { value: 'telepatía' }
    });

    await waitFor(() => {
      expect(document.querySelector('#vozlab-root-search-status')?.textContent).toMatch(
        /Ningún nodo coincide/
      );
    });
  });

  it('calls onselect with the node id and clears the field when a node is chosen', async () => {
    const onselect = mount();

    const field = screen.getByLabelText('Buscar un nodo');

    await fireEvent.input(field, { target: { value: NODE_A.title } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: NODE_A.title })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: NODE_A.title }));

    expect(onselect).toHaveBeenCalledWith(NODE_A.id);
    expect((field as HTMLInputElement).value).toBe('');
  });
});