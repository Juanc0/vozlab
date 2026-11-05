/**
 * The search of the graph, from a test.
 *
 * The floating picker is gone: a node is reached by naming it in the toolbar.
 * These two helpers keep that single path in one place, so a test says what it
 * does — finds a node, or walks to one — instead of how the toolbar spells it.
 */

import { fireEvent, screen } from '@testing-library/svelte';

/** Types the title in the search and returns the match. */
export async function findInSearch(title: string): Promise<HTMLElement> {
  const field = await screen.findByLabelText('Buscar un nodo');

  await fireEvent.input(field, { target: { value: title } });

  return screen.findByRole('button', { name: title });
}

/** Walks the graph to the node, the way a reader does. */
export async function chooseNode(title: string): Promise<void> {
  const option = await findInSearch(title);

  await fireEvent.click(option);
}
