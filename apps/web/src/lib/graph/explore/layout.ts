/**
 * The **layout** of the exploration view.
 *
 * The layout is `dagre`: a deterministic arrangement, never a physics
 * simulation. Every node is a **card** — a rectangle whose height grows
 * with its title — so the space the nodes take is far bigger than the space
 * a dot took. The layout is run again with the real size of the card, so a
 * card that grows takes the room it needs from the picture around it.
 *
 * The separations are **small**: the card holds its own text — the title,
 * the meta line and the body are all inside its rectangle — so the gap
 * between two cards is only the air they need, and every pixel of gap the
 * layout takes is a pixel the reader does not see at the readable zoom.
 *
 * There is no `spacingFactor` here, and for the same reason as in the
 * canvas of the subgraph: Cytoscape's core applies it by pushing every node
 * away from the centre of the picture, so it only inflates the picture.
 *
 * The layout moves **every** node, so a node the user dragged keeps the
 * place it was put through {@link pinTransform}: the instance puts the
 * pinned places back after the layout. (The layout has a `transform` hook of
 * its own, but `cytoscape-dagre` never calls it.)
 */

import type { Position } from 'cytoscape';
import type { DagreLayoutOptions } from 'cytoscape-dagre';

/**
 * The separation between two nodes.
 *
 * It is the room two cards need to breathe: the card holds its own text —
 * the title, the meta line and the body are all inside its rectangle — so
 * the gap between two cards does not have to hold the meta line.
 *
 * The separation does **not** grow with the number of expanded cards: the
 * layout reserves the real height of every card, expanded or not, so the
 * extra air would be a hole in the picture and not a room.
 */
export const NODE_SEPARATION = 40;

/** The separation between two relations. */
export const EDGE_SEPARATION = 24;

/**
 * The separation between two ranks of the layout.
 *
 * It is the room the relation and its label need between two columns: the
 * label of a relation is a key of the system, written at eight pixels, and
 * it is as wide as the key is long.
 */
export const RANK_SEPARATION = 80;

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
 *
 * The layout of `dagre` has a `transform` hook of its own, but
 * `cytoscape-dagre` never calls it: the instance puts the pinned places
 * back itself, with this hook, after the layout has run.
 */
export function pinTransform(
  pinned: ReadonlyMap<string, Position>
): (node: PinnableNode, position: Position) => Position {
  return (node, position) => pinned.get(node.id()) ?? position;
}

/** The options of the layout of the exploration view. */
export function exploreLayoutOptions(): DagreLayoutOptions {
  return {
    name: 'dagre',
    rankDir: 'LR',
    nodeSep: NODE_SEPARATION,
    edgeSep: EDGE_SEPARATION,
    rankSep: RANK_SEPARATION,
    animate: false,
    // The viewport is **not** fitted by the layout: a layout that runs
    // because a node grew must not move the picture under the user's feet.
    // The view fits the window itself, the first time it draws it.
    fit: false
  };
}
