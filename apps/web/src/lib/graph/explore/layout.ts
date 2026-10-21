/**
 * The **layout** of the exploration view.
 *
 * The layout is `dagre`: a deterministic arrangement, never a physics
 * simulation. A node that expands is drawn as a card, so the space it takes
 * grows — the layout is run again with the real size of the card and with a
 * separation that grows with the number of expanded nodes, so the cards do
 * not sit on top of their neighbours.
 *
 * A node the user dragged keeps the place it was put: the layout is the
 * only thing that moves the nodes, and the dragged node is pinned through
 * the layout's `transform` hook.
 */

import type { Position } from 'cytoscape';
import type { DagreLayoutOptions } from 'cytoscape-dagre';

/** The separation between two nodes when none of them is expanded. */
export const BASE_NODE_SEPARATION = 60;

/** The separation each expanded node adds. */
export const EXPANDED_NODE_SEPARATION = 45;

/** The separation between two relations. */
export const EDGE_SEPARATION = 24;

/** The separation between two ranks of the layout. */
export const RANK_SEPARATION = 110;

/**
 * The separation the layout uses for a number of expanded nodes.
 *
 * The more cards there are, the more room they need: a card that is drawn
 * next to another one has to breathe.
 */
export function nodeSeparation(expandedCount: number): number {
  const count = Number.isFinite(expandedCount) ? Math.max(0, Math.trunc(expandedCount)) : 0;
  return BASE_NODE_SEPARATION + EXPANDED_NODE_SEPARATION * count;
}

/** The node of the layout, as far as the pinning is concerned. */
export interface PinnableNode {
  id(): string;
}

/**
 * The hook that **pins** the dragged nodes.
 *
 * The layout computes a position for every node; the hook returns the
 * position the user chose for the nodes that were dragged, and the computed
 * one for the rest.
 */
export function pinTransform(
  pinned: ReadonlyMap<string, Position>
): (node: PinnableNode, position: Position) => Position {
  return (node, position) => pinned.get(node.id()) ?? position;
}

/** The options of the layout of the exploration view. */
export interface ExploreLayoutOptions {
  /** How many nodes are drawn as a card. */
  expandedCount: number;
  /** The positions of the nodes the user dragged. */
  pinned?: ReadonlyMap<string, Position>;
}

/** The options of the layout of the exploration view. */
export function exploreLayoutOptions(options: ExploreLayoutOptions): DagreLayoutOptions {
  return {
    name: 'dagre',
    rankDir: 'LR',
    nodeSep: nodeSeparation(options.expandedCount),
    edgeSep: EDGE_SEPARATION,
    rankSep: RANK_SEPARATION,
    spacingFactor: 1.1,
    animate: false,
    // The viewport is **not** fitted by the layout: a layout that runs
    // because a node grew must not move the picture under the user's feet.
    // The view fits the window itself, the first time it draws it.
    fit: false,
    transform: pinTransform(options.pinned ?? new Map<string, Position>())
  };
}
