/**
 * The **graph of Graphology** — the store of the picture of Sigma.js.
 *
 * Sigma draws what Graphology holds: the graph is the **client's** copy of
 * the picture, and the renderer only reads it. The module fills that store
 * with the same nodes and the same relations the other two panels get, so
 * the three pictures are the same picture.
 *
 * The module is **dev-only**: it belongs to the comparison of the engines.
 */

import type Graph from 'graphology';
import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
import { edgeColor } from '$lib/graph/elements';
import { displayName } from '$lib/i18n/display-name';
import { DEFAULT_LOCALE } from '$lib/i18n/dictionary';

/** How the graph is filled. */
export interface SigmaGraphOptions {
  /** The language of the interface: the name of a relation is read in it. */
  readonly locale?: string;
  /** The places the user put the dragged nodes in. */
  readonly pinned?: ReadonlyMap<string, { x: number; y: number }>;
  /** The radius of the circle the nodes start from, in pixels. */
  readonly radius?: number;
}

/**
 * The place a node starts from.
 *
 * The nodes are placed on a **circle**, deterministically: the same graph
 * always starts from the same picture, and the simulation has something to
 * push apart.
 */
export function circlePosition(
  index: number,
  count: number,
  radius: number
): { x: number; y: number } {
  const angle = (2 * Math.PI * index) / Math.max(1, count);

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius
  };
}

/**
 * Fills the graph of Graphology with the nodes and the relations.
 *
 * The store is emptied first: the picture is drawn again from scratch, and
 * the relations whose ends are not in the picture are not added — a line
 * that goes nowhere is not a line.
 *
 * @param store - The graph of Graphology.
 * @param nodes - The nodes of the picture.
 * @param edges - The relations of the picture.
 * @param options - The language, the pinned places and the radius.
 */
export function fillSigmaGraph(
  store: Graph,
  nodes: readonly NodeDto[],
  edges: readonly SubgraphEdgeDto[],
  options: SigmaGraphOptions = {}
): void {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const radius = options.radius ?? 220;

  // The places the nodes had: a layout that runs again starts from the
  // picture the reader is looking at, and not from a circle.
  const previous = new Map<string, { x: number; y: number }>();

  store.forEachNode((node, attributes) => {
    previous.set(node, {
      x: Number(attributes['x']) || 0,
      y: Number(attributes['y']) || 0
    });
  });

  store.clear();

  nodes.forEach((node, index) => {
    const pinned = options.pinned?.get(node.id);
    const place =
      pinned ?? previous.get(node.id) ?? circlePosition(index, nodes.length, radius);

    store.addNode(node.id, {
      x: place.x,
      y: place.y,
      // A node the user dragged keeps its place: the simulation of
      // ForceAtlas2 does not move a **fixed** node.
      fixed: pinned !== undefined,
      // The node of the WebGL layer is a dot under the card: the card is
      // the picture, and the dot must not show through it.
      size: 3,
      color: '#f9fafb',
      label: node.title
    });
  });

  for (const edge of edges) {
    if (!store.hasNode(edge.sourceNodeId) || !store.hasNode(edge.targetNodeId)) {
      continue;
    }

    store.addEdgeWithKey(edge.id, edge.sourceNodeId, edge.targetNodeId, {
      color: edgeColor(edge.status),
      size: 1.5,
      label: displayName(edge.relationDisplayNames, locale, edge.relationKey)
    });
  }
}
