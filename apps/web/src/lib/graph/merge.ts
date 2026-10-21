/**
 * The **merge** of two sets of nodes or of relations.
 *
 * The exploration view walks the graph: every click asks the API for the
 * subgraph rooted at the clicked node, and the answer is **added** to what
 * the view already holds. Walking must not lose what has been seen — that
 * is the whole point of walking instead of replacing.
 *
 * The merge is by **id**: the same node is one node, and the freshest
 * version of it wins. The order is kept — the node that was already there
 * stays where it was, and the new ones are appended — so the picture does
 * not jump under the reader's feet when the answer lands.
 *
 * Pure: no DOM, no API call.
 */

import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';

/** Merges two sets of nodes — the freshest version of a node wins. */
export function mergeNodes(current: readonly NodeDto[], incoming: readonly NodeDto[]): NodeDto[] {
  return mergeById(current, incoming);
}

/**
 * Merges two sets of relations — the freshest version of a relation wins.
 *
 * The freshest version matters: the score of a relation is the number the
 * API counted, and the answer of a subgraph carries it.
 */
export function mergeEdges(
  current: readonly SubgraphEdgeDto[],
  incoming: readonly SubgraphEdgeDto[]
): SubgraphEdgeDto[] {
  return mergeById(current, incoming);
}

/**
 * Whether two sets hold the same things, in the same order.
 *
 * The page uses it to know when the picture has really changed: a report
 * that says the same thing must not move the state of the page.
 */
export function sameIds<T extends { readonly id: string }>(
  current: readonly T[] | null,
  incoming: readonly T[]
): boolean {
  if (current === null || current.length !== incoming.length) {
    return false;
  }

  return current.every((item, index) => item.id === incoming[index]?.id);
}

/** The merge itself — by id, keeping the order of the first set. */
function mergeById<T extends { readonly id: string }>(
  current: readonly T[],
  incoming: readonly T[]
): T[] {
  if (incoming.length === 0) {
    return [...current];
  }

  const merged = new Map<string, T>();

  for (const item of current) {
    merged.set(item.id, item);
  }

  for (const item of incoming) {
    // `Map.set` on a key that is already there keeps its place: the node
    // that was already in the picture does not move.
    merged.set(item.id, item);
  }

  return [...merged.values()];
}
