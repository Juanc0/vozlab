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
import { CARD_WIDTH } from '../node-card';

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

/**
 * The layouts the exploration view can arrange the picture with.
 *
 * `dagre` is the layout of the app: a deterministic arrangement, never a
 * physics simulation. `fcose` is the **force** layout of the extension —
 * it is kept for the comparison of the engines.
 *
 * `d3` is the **spring of the app**: the pure module of `./force-layout`,
 * a simulation of `d3-force` with a rectangular collision force. It is
 * arranged in slices across the frames, so the reader sees the picture
 * find its place, and it stops by itself when it comes to rest.
 *
 * `dag` is the **clone of `dagre`** — the layered arrangement of `d3-dag`.
 * It is a **candidate**: it is in the comparison of the engines and nowhere
 * else, and `dagre` stays in production. The library is a dependency of
 * the **development surface**, and the comparison hands the clone over to
 * the instance when it mounts the engine — the instance never imports it.
 */
export type GraphLayout = 'dagre' | 'fcose' | 'd3' | 'dag';

/**
 * The options of the **force** layout of `fcose`.
 *
 * They are the options of the extension, written down here so the layout
 * does not have to be imported to be arranged: the extension itself is
 * registered by the development surface that uses it, and the library is
 * **not** a part of the bundle of the app.
 */
export interface FcoseLayoutOptions {
  name: 'fcose';
  /** The quality of the simulation: `default` is the one of the extension. */
  quality: 'default';
  /**
   * Whether the simulation starts from random places.
   *
   * `fcose` has **no** `randomSeed`: its spectral step draws its starting
   * places with `Math.random()`, and there is no way to seed it. The only
   * reproducible picture is the one that starts from the places the nodes
   * already have — which is what `randomize: false` means.
   */
  randomize: boolean;
  /** The separation between two nodes, in pixels. */
  nodeSeparation: number;
  /** The length an edge would like to have, in pixels. */
  idealEdgeLength: number;
  /** How much an edge resists being stretched. */
  edgeElasticity: number;
  /** The gravity that keeps the picture together. */
  gravity: number;
  /**
   * The repulsion between two nodes.
   *
   * The default of the extension is a constant: every node pushes the
   * others with the same force, whatever its size. A node of the app is a
   * **card** — a rectangle of a hundred and forty pixels — and a constant
   * repulsion lets the cards lie on top of each other. The repulsion is
   * therefore taken from the **area** of the card.
   */
  nodeRepulsion: (node: { outerWidth(): number; outerHeight(): number }) => number;
  /** The number of iterations of the simulation. */
  numIter: number;
  /** Whether the picture glides to its new place. */
  animate: boolean;
  /** The duration of the glide, in milliseconds. */
  animationDuration: number;
  /** The easing of the glide. */
  animationEasing: string;
  /** Whether the viewport is fitted to the picture. */
  fit: boolean;
  /**
   * The nodes that must not move.
   *
   * The nodes the user dragged keep their place: the force layout is told
   * about them, because a place set by hand would fight the glide.
   */
  fixedNodeConstraint?: Array<{ nodeId: string; position: Position }>;
}

/** The options of the force layout of `fcose`. */
export function fcoseLayoutOptions(): FcoseLayoutOptions {
  return {
    name: 'fcose',
    quality: 'default',
    // The simulation starts from the places the nodes already have: the
    // extension has no seed, and this is the only way the same graph gives
    // the same picture twice.
    randomize: false,
    nodeSeparation: NODE_SEPARATION,
    idealEdgeLength: CARD_WIDTH * 1.4,
    edgeElasticity: 0.45,
    gravity: 0.25,
    // The repulsion follows the **area** of the card: a card of a hundred
    // and forty pixels pushes the others as much as the extension's
    // constant, and a bigger card pushes them more.
    nodeRepulsion: (node) => {
      const area = node.outerWidth() * node.outerHeight();

      return (4500 * area) / (CARD_WIDTH * 60);
    },
    numIter: 2500,
    // The picture **glides** to its new place: the spring the reader sees
    // is this glide, and it always ends.
    animate: true,
    animationDuration: 800,
    animationEasing: 'ease-out',
    fit: false
  };
}

/**
 * The options of the layout the exploration view is arranged with.
 *
 * @param layout - The layout to arrange the picture with.
 * @returns The options of the layout.
 */
export function explorationLayoutOptions(
  layout: Exclude<GraphLayout, 'd3' | 'dag'>
): DagreLayoutOptions | FcoseLayoutOptions {
  return layout === 'fcose' ? fcoseLayoutOptions() : exploreLayoutOptions();
}

/**
 * The places the force layout starts from.
 *
 * A force layout that begins with every node in the same place has nothing
 * to push apart: the simulation would explode a single point. The nodes are
 * placed on a **circle**, deterministically, so the same graph always
 * starts from the same picture.
 *
 * @param count - The number of nodes.
 * @param radius - The radius of the circle, in pixels.
 * @returns The place of every node, in the order of the nodes.
 */
export function seedCirclePositions(count: number, radius = 220): Position[] {
  const positions: Position[] = [];

  for (let index = 0; index < count; index += 1) {
    const angle = (2 * Math.PI * index) / Math.max(1, count);

    positions.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    });
  }

  return positions;
}
