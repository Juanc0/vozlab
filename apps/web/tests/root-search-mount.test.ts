/**
 * The search of the root picker.
 *
 * The list of every node was the way to pick a root, and a long list is a
 * haystack. The field narrows it as the reader types, and says out loud what
 * is left — a list that shrinks silently looks broken.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import RootPicker from '$lib/components/RootPicker.svelte';
import { localeContext } from './harness/locale';
import { NODE_A, NODE_B } from './fixtures/graph';

/** Renders the picker with two nodes and nothing else in the way. */
function mount(): void {
  render(RootPicker, {
    context: localeContext(),
    props: { nodes: [NODE_A, NODE_B], rootId: null }
  });
}

describe('the search of the root picker', () => {
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

  it('turns an empty answer into a sentence, not an error', async () => {
    mount();

    await fireEvent.input(screen.getByLabelText('Buscar un nodo'), {
      target: { value: 'telepatía' }
    });

    await waitFor(() => {
      expect(screen.getByText(/Ningún nodo coincide/)).toBeInTheDocument();
    });
  });

  it('shows the whole list again when the field is cleared', async () => {
    mount();

    const field = screen.getByLabelText('Buscar un nodo');

    await fireEvent.input(field, { target: { value: NODE_A.title } });
    await fireEvent.input(field, { target: { value: '' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: NODE_B.title })).toBeInTheDocument();
    });
  });
});
