/**
 * The **neighbourhood** of a node inside the working set.
 *
 * The exploration view can show two pictures:
 *
 * - the whole **working set** — the window and every subgraph the user has
 *   walked to. It is a landscape: everything that has been seen.
 * - the **neighbourhood of the focus** — the nodes that are at most `depth`
 *   hops away from the node the view presents, and the relations among
 *   them. It is a close-up: the reader is concentrating.
 *
 * The neighbourhood is computed over what has **already been seen**: it is a
 * filter of the picture, not a way of reading new data. The data itself is
 * always the API's — a click asks for the subgraph rooted at the clicked
 * node, at the selected depth, and the answer is merged into the working
 * set.
 *
 * The traversal is **undirected**, exactly like the API's: a relation joins
 * two nodes and the reader walks it in both directions.
 *
 * Pure: no DOM, no Cytoscape, no API call.
 */

import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';

/** The nodes and the relations of a picture. */
export interface Neighbourhood {
  /** The nodes of the neighbourhood. */
  readonly nodes: NodeDto[];
  /** The relations among the nodes of the neighbourhood. */
  readonly edges: SubgraphEdgeDto[];
}

/**
 * The ids of the nodes that are at most `depth` hops away from the focus.
 *
 * The focus is always part of its own neighbourhood — a node is at zero
 * hops from itself. A focus that is not in the set has no neighbourhood at
 * all: an empty answer is an honest one.
 */
export function neighbourhoodIds(
  nodes: readonly NodeDto[],
  edges: readonly SubgraphEdgeDto[],
  focusId: string | null,
  depth: number
): Set<string> {
  const ids = new Set<string>();

  if (focusId === null) {
    return ids;
  }

  const known = new Set(nodes.map((node) => node.id));

  if (!known.has(focusId)) {
    return ids;
  }

  ids.add(focusId);

  if (depth <= 0) {
    return ids;
  }

  const neighbours = adjacencyOf(nodes, edges);
  let frontier = [focusId];

  for (let hop = 0; hop < depth; hop += 1) {
    const next: string[] = [];

    for (const id of frontier) {
      for (const neighbour of neighbours.get(id) ?? []) {
        if (ids.has(neighbour)) {
          continue;
        }

        ids.add(neighbour);
        next.push(neighbour);
      }
    }

    if (next.length === 0) {
      break;
    }

    frontier = next;
  }

  return ids;
}

/**
 * The picture of the neighbourhood of the focus.
 *
 * Only the relations whose **two ends** are in the neighbourhood are kept:
 * a relation with one end outside would be a line that goes nowhere.
 */
export function filterNeighbourhood(
  nodes: readonly NodeDto[],
  edges: readonly SubgraphEdgeDto[],
  focusId: string | null,
  depth: number
): Neighbourhood {
  const ids = neighbourhoodIds(nodes, edges, focusId, depth);

  return {
    nodes: nodes.filter((node) => ids.has(node.id)),
    edges: edges.filter(
      (edge) => ids.has(edge.sourceNodeId) && ids.has(edge.targetNodeId)
    )
  };
}

/** The neighbours of every node, in both directions. */
function adjacencyOf(
  nodes: readonly NodeDto[],
  edges: readonly SubgraphEdgeDto[]
): Map<string, string[]> {
  const known = new Set(nodes.map((node) => node.id));
  const adjacency = new Map<string, string[]>();

  const link = (from: string, to: string): void => {
    const list = adjacency.get(from);

    if (list === undefined) {
      adjacency.set(from, [to]);
      return;
    }

    list.push(to);
  };

  for (const edge of edges) {
    // A relation with one end outside the set is not a relation of the
    // picture: it would be a line that goes nowhere.
    if (!known.has(edge.sourceNodeId) || !known.has(edge.targetNodeId)) {
      continue;
    }

    link(edge.sourceNodeId, edge.targetNodeId);
    link(edge.targetNodeId, edge.sourceNodeId);
  }

  return adjacency;
}
