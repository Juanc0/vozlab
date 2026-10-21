/**
 * The **spring** of the exploration view.
 *
 * The picture of the exploration view is arranged by `d3-force`: a
 * simulation that pushes the cards apart, pulls the ones that are related
 * together, comes to rest by itself and **stops**.
 *
 * ## Why this module exists
 *
 * The layout is **not** a Cytoscape extension: it is a **pure module** —
 * no DOM, no canvas, no Cytoscape. It takes the nodes (with the **real
 * size of their cards**), the relations and the options, and it answers
 * with the **places** of the nodes.
 *
 * The reason is the test: a layout that returns places can be tested
 * without a canvas, and it survives a change of the painter. The repository
 * is moving towards a *model / layout / painter* split, and this module is
 * the **layout** of it.
 *
 * ## The two things `d3-force` does not do
 *
 * `d3-force` was chosen because it is the smallest (3 KB), the only one
 * with a real numeric seed, the only one that stops by its own criterion
 * (`alpha`) and the only one that can be moved into a Web Worker. What it
 * lacks is the **collision of rectangles**: `forceCollide` takes a radius,
 * and a card is a box of a hundred and forty by sixty pixels.
 *
 * - **The collision is rectangular.** Two cards that overlap are pushed
 *   apart along the **axis of least penetration**, by half of the overlap
 *   each. A circle of the half-diagonal (76 px) would over-resolve the
 *   cards and inflate the picture by some forty per cent.
 * - **The repulsion follows the area.** `d3`'s many-body force is a point
 *   charge: a card of a hundred and forty pixels and a card of twenty push
 *   each other with the same strength. Here the charge of a node is
 *   proportional to the **area** of its card, so the picture is not
 *   dominated by the small cards. (The mass of ForceAtlas2 — one plus the
 *   weighted degree — is **not** copied: that is the thing that does not
 *   scale with the area.)
 *
 * ## The determinism
 *
 * The same graph gives **the same picture, bit for bit**:
 *
 * - the simulation draws from a **seeded** generator (`lcg`), and the seed
 *   is a constant of the module ({@link FORCE_LAYOUT_SEED});
 * - the nodes start from the **circle** of `./layout` — the same seeding
 *   the force layout of `fcose` uses.
 *
 * Two runs from the same start therefore give exactly the same places, and
 * the test says so with an exact comparison, not with a tolerance.
 *
 * ## The animation
 *
 * The spring is **seen**: the picture is arranged in slices, a few ticks
 * per frame, and the reader watches the cards find their place. When the
 * simulation comes to rest, the loop **stops**: there is no timer left and
 * nothing running.
 *
 * A reader who asked for less motion (`prefers-reduced-motion`) gets the
 * same picture **in one go**: the layout runs to its conclusion without the
 * intermediate frames, and the places are the same ones.
 */

import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum
} from 'd3-force';

import { CARD_WIDTH } from '../node-card';
import { seedCirclePositions } from './layout';

/**
 * The seed of the spring.
 *
 * The picture is the same every time: the seed is **written down** here,
 * and a change of it is a change of the picture of the app — a thing that
 * has to be a decision, not an accident.
 */
export const FORCE_LAYOUT_SEED = 20260211;

/**
 * The area of the **reference card**, in square pixels.
 *
 * The repulsion is written for a card of this area: a card of the
 * reference area pushes the others as much as the constant of the option,
 * and a bigger card pushes them more.
 */
export const REFERENCE_CARD_AREA = CARD_WIDTH * 60;

/**
 * The length a relation would like to have, in pixels.
 *
 * It is a card and a little more: the two cards of a relation have to be
 * seen apart, and the relation between them has to be read.
 */
export const DEFAULT_LINK_DISTANCE = 170;

/**
 * The repulsion of a card of the reference area.
 *
 * The number is negative on purpose: the force of `d3` is negative when it
 * pushes the nodes apart.
 *
 * It is **weak on purpose**: the repulsion decides how far the picture
 * spreads, and a strong one turns the graph into a scatter of cards. The
 * collision, not the repulsion, is what keeps the cards apart.
 */
export const DEFAULT_CHARGE_STRENGTH = -450;

/** The room two cards keep between them, in pixels. */
export const DEFAULT_COLLISION_PADDING = 8;

/**
 * How many passes the collision makes on every tick.
 *
 * One pass is not enough: a card that is pushed into another one has to be
 * pushed again, and the picture of two hundred cards is a chain of them.
 * The passes stop as soon as a pass finds nothing to correct.
 */
export const DEFAULT_COLLISION_ITERATIONS = 4;

/** A place in the picture, in the coordinates of the canvas. */
export interface ForcePosition {
  /** The x of the place. */
  readonly x: number;
  /** The y of the place. */
  readonly y: number;
}

/** A node of the spring, as the module sees it. */
export interface ForceNode {
  /** The id of the node. */
  readonly id: string;
  /** The x of the node. */
  x: number;
  /** The y of the node. */
  y: number;
  /** The velocity of the node on the x axis. */
  vx: number;
  /** The velocity of the node on the y axis. */
  vy: number;
  /** The index of the node in the simulation. */
  index?: number;
  /** The x of the place the node is **fixed** to, or `null`. */
  fx: number | null;
  /** The y of the place the node is **fixed** to, or `null`. */
  fy: number | null;
  /** The width of the card, in pixels. */
  width: number;
  /** The height of the card, in pixels. */
  height: number;
  /** The mass of the node: the area of the card, in square pixels. */
  mass: number;
}

/** A node as the caller describes it. */
export interface ForceNodeInput {
  /** The id of the node. */
  readonly id: string;
  /** The width of the card of the node, in pixels. */
  readonly width: number;
  /** The height of the card of the node, in pixels. */
  readonly height: number;
  /** The place the node starts from. */
  readonly x?: number;
  /** The y of the place the node starts from. */
  readonly y?: number;
  /**
   * Whether the node keeps the place it is given.
   *
   * A node the reader dragged keeps the place it was put: the spring must
   * not fight a place set by hand.
   */
  readonly pinned?: boolean;
}

/** A relation as the caller describes it. */
export interface ForceEdgeInput {
  /** The id of the node the relation comes from. */
  readonly source: string;
  /** The id of the node the relation goes to. */
  readonly target: string;
}

/** The options of the spring. */
export interface ForceLayoutOptions {
  /** The seed of the generator of the simulation. */
  readonly seed?: number;
  /** The alpha below which the picture is at rest. */
  readonly alphaMin?: number;
  /** How fast the alpha falls. */
  readonly alphaDecay?: number;
  /** The alpha the picture is pulled back to. */
  readonly alphaTarget?: number;
  /**
   * The fraction of the velocity that is lost on every tick.
   *
   * It is four tenths: the picture keeps a little of its momentum, so it
   * glides into its place instead of stopping dead.
   */
  readonly velocityDecay?: number;
  /** The length a relation would like to have, in pixels. */
  readonly linkDistance?: number;
  /** How much a relation resists being stretched. */
  readonly linkStrength?: number;
  /**
   * The repulsion of a card of the reference area.
   *
   * It is negative: the force pushes the cards apart.
   */
  readonly chargeStrength?: number;
  /** The distance beyond which the repulsion is not felt. */
  readonly chargeMaxDistance?: number;
  /** The room two cards keep between them, in pixels. */
  readonly collisionPadding?: number;
  /**
   * The room two cards of the **starting circle** keep, in pixels.
   *
   * The circle is only the start of the simulation: the picture finds its
   * own scale. The number decides how spread the picture is at the first
   * frame — and a picture that starts spread ends up spread.
   */
  readonly seedSpacing?: number;
  /** How many passes the collision makes on every tick. */
  readonly collisionIterations?: number;
  /** The most ticks the simulation runs before it gives up. */
  readonly maxTicks?: number;
  /** The places of the nodes that must not move. */
  readonly pinned?: ReadonlyMap<string, ForcePosition>;
}

/** What the spring tells when it stops. */
export interface ForceLayoutResult {
  /** The place of every node. */
  readonly positions: Map<string, ForcePosition>;
  /** How many ticks ran. */
  readonly ticks: number;
  /** Whether the picture came to rest on its own. */
  readonly settled: boolean;
  /**
   * The instant the **simulation** took, in milliseconds.
   *
   * It is the time of the ticks, and not the wall clock of the animation:
   * the animation waits for the frames of the browser, and the wait is not
   * the work of the layout.
   */
  readonly ms: number;
  /** The number of pairs of cards that overlap. */
  readonly overlaps: number;
}

/** The spring of a picture. */
export interface ForceLayout {
  /** The nodes of the simulation. */
  readonly nodes: readonly ForceNode[];
  /**
   * Runs the simulation.
   *
   * @param ticks - How many ticks to run. It stops early when the picture
   *   has come to rest.
   */
  step(ticks?: number): void;
  /** Whether the picture has come to rest. */
  readonly settled: boolean;
  /** How many ticks ran. */
  readonly ticks: number;
  /** The alpha of the simulation: how much life the picture has left. */
  readonly alpha: number;
  /** The place of every node. */
  positions(): Map<string, ForcePosition>;
  /**
   * Fixes a node to a place.
   *
   * A node the reader dragged is fixed: the spring works around it.
   */
  pin(id: string, place: ForcePosition): void;
  /** The number of pairs of cards that overlap right now. */
  overlaps(): number;
  /** What the spring tells about itself. */
  result(): ForceLayoutResult;
}

/**
 * The clock of the module.
 *
 * It is the clock of the browser when there is one, and the clock of the
 * machine when there is not: the module is pure, and it runs in a test
 * without a browser.
 *
 * @returns The milliseconds since an arbitrary instant.
 */
function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

/**
 * The generator of the simulation.
 *
 * It is the **linear congruential generator** of `d3` — the same constants,
 * the same arithmetic — with a **seed**: the picture of the same graph is
 * the same one, every time, in every browser.
 *
 * @param seed - The seed of the generator.
 * @returns The generator: a number between zero and one on every call.
 */
export function lcg(seed: number): () => number {
  let state = (Math.trunc(seed) >>> 0) || 1;

  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;

    return state / 4294967296;
  };
}

/**
 * The radius of the circle the nodes start from.
 *
 * The circle is **big enough** for the cards: two hundred cards of a
 * hundred and forty pixels on a circle of two hundred and twenty pixels is
 * a pile, and a pile explodes. The radius grows with the number of the
 * nodes, so the picture starts spread and the spring pulls it together.
 *
 * @param count - The number of nodes.
 * @param spacing - The room two cards of the circle keep, in pixels.
 * @returns The radius of the circle, in pixels.
 */
export function seedRadius(count: number, spacing = DEFAULT_LINK_DISTANCE): number {
  if (count <= 1) {
    return 0;
  }

  return Math.max(220, (count * spacing) / (2 * Math.PI));
}

/**
 * The overlap of two boxes.
 *
 * The overlap is the **penetration** of the two boxes: how much they would
 * have to move apart, on each axis, to touch and no more. The axis of the
 * **least penetration** is the one they are pushed apart along: it is the
 * shortest way out for both of them.
 *
 * @param first - The first box.
 * @param second - The second box.
 * @param padding - The room the two boxes keep between them.
 * @returns The correction, or `null` when the boxes do not overlap.
 */
export function boxCorrection(
  first: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  second: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  padding = 0
): { readonly x: number; readonly y: number } | null {
  const overlapX = (first.width + second.width) / 2 + padding - Math.abs(second.x - first.x);
  const overlapY =
    (first.height + second.height) / 2 + padding - Math.abs(second.y - first.y);

  if (overlapX <= 0 || overlapY <= 0) {
    return null;
  }

  // The axis of the least penetration: the shortest way out.
  if (overlapX <= overlapY) {
    const direction = second.x >= first.x ? 1 : -1;

    return { x: overlapX * direction, y: 0 };
  }

  const direction = second.y >= first.y ? 1 : -1;

  return { x: 0, y: overlapY * direction };
}

/**
 * The grid of the boxes.
 *
 * The search of the neighbours of a box is **not** a walk over every box:
 * a uniform grid answers the boxes that are near, and the cost of a pass
 * grows with the number of the boxes and not with its square.
 */
class SpatialGrid {
  readonly #cells = new Map<string, number[]>();
  readonly #cellSize: number;

  constructor(nodes: readonly ForceNode[], cellSize: number) {
    this.#cellSize = cellSize;

    for (const node of nodes) {
      const index = node.index ?? 0;
      const minX = Math.floor((node.x - node.width / 2) / cellSize);
      const maxX = Math.floor((node.x + node.width / 2) / cellSize);
      const minY = Math.floor((node.y - node.height / 2) / cellSize);
      const maxY = Math.floor((node.y + node.height / 2) / cellSize);

      for (let column = minX; column <= maxX; column += 1) {
        for (let row = minY; row <= maxY; row += 1) {
          const key = `${column}:${row}`;
          const cell = this.#cells.get(key);

          if (cell === undefined) {
            this.#cells.set(key, [index]);
            continue;
          }

          cell.push(index);
        }
      }
    }
  }

  /** The boxes of the cells a box touches. */
  near(node: ForceNode): number[] {
    const minX = Math.floor((node.x - node.width / 2) / this.#cellSize);
    const maxX = Math.floor((node.x + node.width / 2) / this.#cellSize);
    const minY = Math.floor((node.y - node.height / 2) / this.#cellSize);
    const maxY = Math.floor((node.y + node.height / 2) / this.#cellSize);

    const found: number[] = [];

    for (let column = minX; column <= maxX; column += 1) {
      for (let row = minY; row <= maxY; row += 1) {
        const cell = this.#cells.get(`${column}:${row}`);

        if (cell === undefined) {
          continue;
        }

        found.push(...cell);
      }
    }

    return found;
  }
}

/**
 * The size of the cell of the grid.
 *
 * The cell is as big as the biggest card: a card never touches more than
 * four cells, and every box that can overlap it is in one of them.
 */
function cellSizeOf(nodes: readonly ForceNode[], padding: number): number {
  let size = 1;

  for (const node of nodes) {
    size = Math.max(size, node.width + padding, node.height + padding);
  }

  return size;
}

/**
 * The charge of a card of a given area.
 *
 * The charge follows the **area**: a card of twice the area pushes the
 * others twice as much. It is the rule the repulsion of the spring is
 * written with, and it is **not** the mass of ForceAtlas2 (one plus the
 * weighted degree): that is the thing that does not scale with the area.
 *
 * @param area - The area of the card, in square pixels.
 * @param base - The charge of a card of the reference area.
 * @returns The charge of the card.
 */
export function areaCharge(area: number, base = DEFAULT_CHARGE_STRENGTH): number {
  return (base * area) / REFERENCE_CARD_AREA;
}

/**
 * The **rectangular collision** of the cards.
 *
 * Two cards that overlap are pushed apart along the axis of the least
 * penetration, and the overlap is split between them: the correction of
 * one is the share of the other, weighted by the mass (the area of the
 * card). Two cards of the same area move the same distance; a big card
 * moves less than a small one.
 *
 * A card that is **fixed** — a node the reader dragged — does not move at
 * all: the other card takes the whole correction.
 *
 * The correction is **positional**: it moves the cards where they are, and
 * not their velocity. A card that overlaps another one is *wrong* where it
 * is, and the picture has to be right in the frame it is drawn.
 *
 * @param nodes - The nodes of the picture.
 * @param padding - The room two cards keep between them.
 * @param iterations - How many passes the correction makes.
 * @returns How many pairs were corrected.
 */
export function applyRectangularCollision(
  nodes: readonly ForceNode[],
  padding = DEFAULT_COLLISION_PADDING,
  iterations = DEFAULT_COLLISION_ITERATIONS
): number {
  if (nodes.length < 2) {
    return 0;
  }

  const cellSize = cellSizeOf(nodes, padding);
  let corrected = 0;

  for (let pass = 0; pass < iterations; pass += 1) {
    const grid = new SpatialGrid(nodes, cellSize);
    let corrections = 0;

    for (const node of nodes) {
      const index = node.index ?? 0;

      for (const candidate of grid.near(node)) {
        // Every pair is seen once: the boxes of the grid repeat the
        // neighbours of a card that touches more than one cell.
        if (candidate <= index) {
          continue;
        }

        const other = nodes[candidate];

        if (other === undefined) {
          continue;
        }

        const correction = boxCorrection(node, other, padding);

        if (correction === null) {
          continue;
        }

        const total = node.mass + other.mass;
        const shareOfNode = total === 0 ? 0.5 : other.mass / total;
        const shareOfOther = total === 0 ? 0.5 : node.mass / total;

        // A fixed card does not move: the other one takes the correction.
        const nodeMoves = node.fx === null && node.fy === null;
        const otherMoves = other.fx === null && other.fy === null;

        if (!nodeMoves && !otherMoves) {
          continue;
        }

        const share = nodeMoves ? (otherMoves ? shareOfNode : 1) : 0;
        const otherShare = otherMoves ? (nodeMoves ? shareOfOther : 1) : 0;

        node.x -= correction.x * share;
        node.y -= correction.y * share;
        other.x += correction.x * otherShare;
        other.y += correction.y * otherShare;

        corrections += 1;
      }
    }

    corrected += corrections;

    if (corrections === 0) {
      break;
    }
  }

  return corrected;
}

/** A box of the picture, as the counter of the overlaps sees it. */
export interface OverlapBox {
  /** The x of the centre of the box. */
  readonly x: number;
  /** The y of the centre of the box. */
  readonly y: number;
  /** The width of the box. */
  readonly width: number;
  /** The height of the box. */
  readonly height: number;
}

/**
 * Counts the pairs of cards that overlap.
 *
 * It is the metric that told the truth about `fcose`: a layout that settles
 * in half a second can still leave hundreds of pairs of cards on top of
 * each other.
 *
 * @param boxes - The boxes of the picture.
 * @returns How many pairs overlap.
 */
export function countOverlappingPairs(boxes: readonly OverlapBox[]): number {
  if (boxes.length < 2) {
    return 0;
  }

  let size = 1;

  for (const box of boxes) {
    size = Math.max(size, box.width, box.height);
  }

  const cells = new Map<string, number[]>();

  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index] as OverlapBox;
    const minX = Math.floor((box.x - box.width / 2) / size);
    const maxX = Math.floor((box.x + box.width / 2) / size);
    const minY = Math.floor((box.y - box.height / 2) / size);
    const maxY = Math.floor((box.y + box.height / 2) / size);

    for (let column = minX; column <= maxX; column += 1) {
      for (let row = minY; row <= maxY; row += 1) {
        const key = `${column}:${row}`;
        const cell = cells.get(key);

        if (cell === undefined) {
          cells.set(key, [index]);
          continue;
        }

        cell.push(index);
      }
    }
  }

  let overlapping = 0;

  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index] as OverlapBox;
    const minX = Math.floor((box.x - box.width / 2) / size);
    const maxX = Math.floor((box.x + box.width / 2) / size);
    const minY = Math.floor((box.y - box.height / 2) / size);
    const maxY = Math.floor((box.y + box.height / 2) / size);

    for (let column = minX; column <= maxX; column += 1) {
      for (let row = minY; row <= maxY; row += 1) {
        const cell = cells.get(`${column}:${row}`);

        if (cell === undefined) {
          continue;
        }

        for (const candidate of cell) {
          if (candidate <= index) {
            continue;
          }

          const other = boxes[candidate] as OverlapBox;

          if (boxCorrection(box, other) !== null) {
            overlapping += 1;
          }
        }
      }
    }
  }

  return overlapping;
}

/** The relation of the simulation, as `d3` sees it. */
interface SimulationLink extends SimulationLinkDatum<ForceNode> {
  source: string | ForceNode;
  target: string | ForceNode;
}

/**
 * Creates the spring of a picture.
 *
 * @param nodes - The nodes of the picture, with the real size of their
 *   cards.
 * @param edges - The relations of the picture.
 * @param options - The options of the spring.
 * @returns The spring.
 */
export function createForceLayout(
  nodes: readonly ForceNodeInput[],
  edges: readonly ForceEdgeInput[],
  options: ForceLayoutOptions = {}
): ForceLayout {
  const seed = options.seed ?? FORCE_LAYOUT_SEED;
  const alphaMin = options.alphaMin ?? 0.001;
  const alphaDecay = options.alphaDecay ?? 1 - Math.pow(alphaMin, 1 / 300);
  const velocityDecay = options.velocityDecay ?? 0.4;
  const linkDistance = options.linkDistance ?? DEFAULT_LINK_DISTANCE;
  const linkStrength = options.linkStrength ?? undefined;
  const chargeStrength = options.chargeStrength ?? DEFAULT_CHARGE_STRENGTH;
  const chargeMaxDistance = options.chargeMaxDistance ?? Infinity;
  const collisionPadding = options.collisionPadding ?? DEFAULT_COLLISION_PADDING;
  const collisionIterations = options.collisionIterations ?? DEFAULT_COLLISION_ITERATIONS;
  const maxTicks = options.maxTicks ?? 600;

  // The nodes of the simulation: the card of every node, with its real
  // size, and the place it starts from.
  const seeds = seedCirclePositions(nodes.length, seedRadius(nodes.length, options.seedSpacing ?? DEFAULT_LINK_DISTANCE));

  const simulationNodes: ForceNode[] = nodes.map((node, index) => {
    const seedPlace = seeds[index];
    const pinnedPlace = options.pinned?.get(node.id);

    // A node is **fixed** when the reader put it in a place: either the
    // caller gives the place, or the node says it keeps the one it has.
    const fixed =
      pinnedPlace !== undefined ||
      (node.pinned === true && node.x !== undefined && node.y !== undefined);

    const x = node.x ?? pinnedPlace?.x ?? seedPlace?.x ?? 0;
    const y = node.y ?? pinnedPlace?.y ?? seedPlace?.y ?? 0;

    return {
      id: node.id,
      x,
      y,
      vx: 0,
      vy: 0,
      index,
      fx: fixed ? (pinnedPlace?.x ?? x) : null,
      fy: fixed ? (pinnedPlace?.y ?? y) : null,
      width: node.width,
      height: node.height,
      // The mass is the **area** of the card: a big card pushes the others
      // more and moves less.
      mass: Math.max(1, node.width * node.height)
    };
  });

  const links: SimulationLink[] = edges.map((edge) => ({
    source: edge.source,
    target: edge.target
  }));

  const simulation: Simulation<ForceNode, SimulationLink> = forceSimulation<ForceNode, SimulationLink>(
    simulationNodes
  );

  // The simulation has a timer of its own: the spring is driven by hand,
  // in slices, and the timer would run it a second time.
  simulation.stop();

  const linkForce = forceLink<ForceNode, SimulationLink>(links)
    .id((node) => node.id)
    .distance(linkDistance);

  // The strength of the relations is the one of `d3` unless the caller
  // writes another one: passing `undefined` to the setter of the library
  // would make the strength `NaN`.
  if (linkStrength !== undefined) {
    linkForce.strength(linkStrength);
  }

  simulation
    .alphaMin(alphaMin)
    .alphaDecay(alphaDecay)
    .alphaTarget(options.alphaTarget ?? 0)
    .velocityDecay(velocityDecay)
    .force('link', linkForce)
    .force(
      'charge',
      forceManyBody<ForceNode>()
        // The charge follows the **area** of the card: the point charge of
        // `d3` would push a big card and a small one with the same
        // strength.
        .strength((node) => areaCharge(node.mass, chargeStrength))
        .distanceMax(chargeMaxDistance)
    )
    .force('center', forceCenter<ForceNode>(0, 0));

  // The seed of the generator: the picture is the same one every time.
  simulation.randomSource(lcg(seed));

  let ticks = 0;
  let settled = false;

  /**
   * The time of the **simulation**, in milliseconds.
   *
   * It is the sum of the ticks: the wall clock of the animation also
   * carries the wait for the frames of the browser, and that wait is not
   * the work of the layout.
   */
  let simulationMs = 0;

  const layout: ForceLayout = {
    nodes: simulationNodes,

    step(count = 1): void {
      for (let index = 0; index < count; index += 1) {
        if (settled || ticks >= maxTicks) {
          break;
        }

        const began = now();

        simulation.tick(1);

        // The collision is applied **after** the integration: the cards
        // are corrected where they are, and the picture of the frame that
        // is drawn has no two cards on top of each other.
        applyRectangularCollision(simulationNodes, collisionPadding, collisionIterations);

        ticks += 1;
        simulationMs += now() - began;

        if (simulation.alpha() < alphaMin) {
          settled = true;
        }
      }
    },

    get settled(): boolean {
      return settled;
    },

    get ticks(): number {
      return ticks;
    },

    get alpha(): number {
      return simulation.alpha();
    },

    positions(): Map<string, ForcePosition> {
      const places = new Map<string, ForcePosition>();

      for (const node of simulationNodes) {
        places.set(node.id, { x: node.x, y: node.y });
      }

      return places;
    },

    pin(id: string, place: ForcePosition): void {
      const node = simulationNodes.find((candidate) => candidate.id === id);

      if (node === undefined) {
        return;
      }

      node.fx = place.x;
      node.fy = place.y;
      node.x = place.x;
      node.y = place.y;
    },

    overlaps(): number {
      return countOverlappingPairs(simulationNodes);
    },

    result(): ForceLayoutResult {
      return {
        positions: layout.positions(),
        ticks,
        settled,
        ms: simulationMs,
        overlaps: layout.overlaps()
      };
    }
  };

  return layout;
}

/**
 * Runs the spring to its conclusion, in one go.
 *
 * This is the path of the reader who asked for less motion: the picture is
 * arranged without the intermediate frames, and it is **the same picture**
 * the animated path arrives at.
 *
 * @param layout - The spring.
 * @param maxTicks - The most ticks the spring runs.
 * @returns What the spring tells about itself.
 */
export function runForceLayoutToRest(layout: ForceLayout, maxTicks = 600): ForceLayoutResult {
  layout.step(maxTicks);

  return layout.result();
}

/** The frames of the animation, as the caller sees them. */
export interface FrameScheduler {
  /**
   * Asks for a frame.
   *
   * @param callback - What runs in the frame.
   * @returns The handle of the frame.
   */
  request(callback: () => void): number;
  /**
   * Cancels a frame.
   *
   * @param handle - The handle of the frame.
   */
  cancel(handle: number): void;
}

/** The options of the driver of the spring. */
export interface ForceDriverOptions {
  /** The frames of the animation. */
  readonly scheduler: FrameScheduler;
  /**
   * How many ticks run in one frame.
   *
   * The number is a **budget**: a frame of the picture must stay short, or
   * the canvas of the reader stutters. It is also what makes the spring
   * **seen**: too many ticks per frame and the picture jumps.
   */
  readonly ticksPerFrame?: number;
  /** The most frames the driver runs. */
  readonly maxFrames?: number;
  /** Called on every frame, with the places of the picture. */
  readonly onFrame?: (positions: Map<string, ForcePosition>, alpha: number) => void;
  /** Called when the picture comes to rest. */
  readonly onSettled?: (result: ForceLayoutResult) => void;
}

/** The driver of the spring. */
export interface ForceDriver {
  /** Starts the animation. */
  start(): void;
  /** Stops the animation: nothing runs after this. */
  stop(): void;
  /** Whether the animation is running. */
  readonly running: boolean;
  /** Whether the picture has come to rest. */
  readonly settled: boolean;
  /** How many frames ran. */
  readonly frames: number;
}

/**
 * Drives the spring, in slices, across the frames.
 *
 * The driver asks for a frame, runs a few ticks, draws the picture and
 * asks for another frame — **until** the picture comes to rest. Then it
 * stops: no frame is asked for, no timer is left, nothing runs.
 *
 * @param layout - The spring.
 * @param options - The options of the driver.
 * @returns The driver.
 */
export function driveForceLayout(
  layout: ForceLayout,
  options: ForceDriverOptions
): ForceDriver {
  const ticksPerFrame = options.ticksPerFrame ?? 4;
  const maxFrames = options.maxFrames ?? 600;

  let handle = 0;
  let running = false;
  let settled = false;
  let frames = 0;

  const frame = (): void => {
    handle = 0;

    if (!running) {
      return;
    }

    layout.step(ticksPerFrame);
    frames += 1;

    options.onFrame?.(layout.positions(), layout.alpha);

    if (layout.settled || frames >= maxFrames) {
      running = false;
      settled = layout.settled;

      options.onSettled?.(layout.result());

      // **No frame is asked for**: the animation stops here.
      return;
    }

    handle = options.scheduler.request(frame);
  };

  return {
    start(): void {
      if (running) {
        return;
      }

      running = true;
      settled = false;
      frames = 0;
      handle = options.scheduler.request(frame);
    },

    stop(): void {
      if (!running) {
        return;
      }

      running = false;

      if (handle !== 0) {
        options.scheduler.cancel(handle);
        handle = 0;
      }
    },

    get running(): boolean {
      return running;
    },

    get settled(): boolean {
      return settled;
    },

    get frames(): number {
      return frames;
    }
  };
}
