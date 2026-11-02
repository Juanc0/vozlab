/**
 * The **spring** of Graphology: the ForceAtlas2 layout, driven step by
 * step.
 *
 * The layout of `graphology-layout-forceatlas2` is **synchronous**: it runs
 * all its iterations in one call and gives the picture back when it is
 * done. That is a layout, not a spring: the reader never sees the picture
 * find its place.
 *
 * The driver of this module runs the simulation **one iteration per
 * frame**, so the reader sees the picture settle, and it stops the
 * simulation as soon as the picture stops moving (see `./settle`): a
 * simulation that never stops burns the battery.
 *
 * The simulation is **deterministic**: the library has no random step, and
 * the picture starts from the places this module gives it. The same graph
 * always gives the same picture — the spring and the reproducibility are
 * not exclusive.
 *
 * The module is **dev-only**: it belongs to the comparison of the engines.
 */

import forceAtlas2, { type ForceAtlas2Settings } from 'graphology-layout-forceatlas2';
import type Graph from 'graphology';
import { createSettleWatcher, type SettleWatcher } from './settle';

/** How the spring is driven. */
export interface SpringOptions {
  /** The most iterations the simulation may run. */
  readonly maxIterations?: number;
  /** The movement below which the picture is at rest, in pixels. */
  readonly threshold?: number;
  /** How many quiet steps in a row settle the picture. */
  readonly quietSteps?: number;
  /** The settings of the simulation. */
  readonly settings?: ForceAtlas2Settings;
}

/** The spring of a graph. */
export interface Spring {
  /**
   * Runs the simulation, one iteration per frame, until the picture
   * settles.
   *
   * @param onstep - Called after every iteration, with the picture.
   * @returns A promise that answers when the simulation has stopped.
   */
  run(onstep?: () => void): Promise<SpringReport>;
  /** Stops the simulation. */
  stop(): void;
  /** Whether the picture has settled. */
  readonly settled: boolean;
}

/** What the spring tells when it stops. */
export interface SpringReport {
  /** Whether the picture settled. */
  readonly settled: boolean;
  /** How many iterations ran. */
  readonly iterations: number;
  /** The instant the simulation took, in milliseconds. */
  readonly ms: number;
}

/** The most iterations a spring runs before it gives up. */
const MAX_ITERATIONS = 240;

/**
 * How many iterations the spring runs in one frame.
 *
 * The simulation of the library is **synchronous**: it runs all its
 * iterations in one call. One iteration per frame would take ten seconds
 * to settle, and the reader would be looking at a picture that moves for
 * ten seconds. Five iterations per frame settle the picture in about a
 * second, and the spring is still seen.
 */
const ITERATIONS_PER_FRAME = 5;

/**
 * Reads the places of the nodes of a graph.
 *
 * @param graph - The graph of the spring.
 * @returns The place of every node.
 */
export function readPositions(graph: Graph): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  graph.forEachNode((node, attributes) => {
    positions.set(node, { x: Number(attributes['x']) || 0, y: Number(attributes['y']) || 0 });
  });

  return positions;
}

/**
 * The greatest distance a node travelled between two pictures.
 *
 * @param before - The places before the step.
 * @param after - The places after the step.
 * @returns The distance, in pixels.
 */
export function greatestMovement(
  before: ReadonlyMap<string, { x: number; y: number }>,
  after: ReadonlyMap<string, { x: number; y: number }>
): number {
  let greatest = 0;

  for (const [node, place] of after) {
    const last = before.get(node);

    if (last === undefined) {
      continue;
    }

    greatest = Math.max(greatest, Math.hypot(place.x - last.x, place.y - last.y));
  }

  return greatest;
}

/**
 * Creates the spring of a graph.
 *
 * The simulation is stepped by the caller: the driver asks for the next
 * frame with `requestAnimationFrame`, so the picture is painted between the
 * steps and the reader sees the spring.
 */
export function createSpring(graph: Graph, options: SpringOptions = {}): Spring {
  const maxIterations = options.maxIterations ?? MAX_ITERATIONS;
  const settings = options.settings ?? inferSettings(graph);

  let watcher: SettleWatcher | null = null;
  let frame = 0;
  let running = false;

  function stop(): void {
    if (!running) {
      return;
    }

    running = false;

    if (frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  return {
    async run(onstep?: () => void): Promise<SpringReport> {
      const started = Date.now();
      let iterations = 0;

      watcher = createSettleWatcher({
        threshold: options.threshold,
        quietSteps: options.quietSteps,
        stop: () => {
          stop();
        }
      });

      running = true;

      await new Promise<void>((resolve) => {
        const step = (): void => {
          if (!running) {
            resolve();
            return;
          }

          const before = readPositions(graph);

          forceAtlas2.assign(graph, { iterations: ITERATIONS_PER_FRAME, settings });

          const after = readPositions(graph);
          const movement = greatestMovement(before, after);

          iterations += ITERATIONS_PER_FRAME;
          onstep?.();

          const settled = watcher?.step(movement) ?? false;

          if (settled || iterations >= maxIterations) {
            running = false;
            resolve();
            return;
          }

          frame = requestAnimationFrame(step);
        };

        frame = requestAnimationFrame(step);
      });

      return {
        settled: watcher?.settled ?? false,
        iterations,
        ms: Date.now() - started
      };
    },

    stop,

    get settled(): boolean {
      return watcher?.settled ?? false;
    }
  };
}

/**
 * The settings of the simulation for a graph.
 *
 * They are the ones the library infers for the size of the graph: the
 * gravity that keeps the picture together and the slowdown that keeps it
 * from exploding.
 */
export function inferSettings(graph: Graph): ForceAtlas2Settings {
  return forceAtlas2.inferSettings(graph);
}

/**
 * Scales the picture so that its relations have the length they should
 * have.
 *
 * The **scale** of a force layout is arbitrary: the forces of the
 * simulation are the same at any distance, and the picture settles at the
 * distance the parameters say. A card of the app is a hundred and forty
 * pixels wide, and a relation whose ends are four pixels apart would draw
 * the cards on top of each other.
 *
 * The picture is therefore **normalised**: the middle relation of the
 * picture is given the length of a card and a half, and the whole picture
 * is scaled with it. The shape of the picture does not change: only its
 * size.
 *
 * @param graph - The graph of the picture.
 * @param targetLength - The length the relations should have, in pixels.
 * @returns The factor the picture was scaled by.
 */
export function normalizePicture(graph: Graph, targetLength: number): number {
  const lengths: number[] = [];

  graph.forEachEdge((_edge, _attributes, source, target) => {
    const from = graph.getNodeAttributes(source);
    const to = graph.getNodeAttributes(target);

    const length = Math.hypot(Number(from['x']) - Number(to['x']), Number(from['y']) - Number(to['y']));

    if (length > 0) {
      lengths.push(length);
    }
  });

  if (lengths.length === 0) {
    return 1;
  }

  lengths.sort((left, right) => left - right);

  const middle = lengths[Math.floor(lengths.length / 2)] ?? 0;

  if (middle <= 0) {
    return 1;
  }

  const factor = targetLength / middle;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let broken = 0;

  graph.forEachNode((_node, attributes) => {
    const x = Number(attributes['x']);
    const y = Number(attributes['y']);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      broken += 1;
      return;
    }

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });

  if (broken > 0) {
    console.warn(
      `the simulation left ${broken} nodes without a place: they are put in the centre of the picture`
    );
  }

  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;

  graph.forEachNode((node, attributes) => {
    const x = Number(attributes['x']);
    const y = Number(attributes['y']);

    graph.setNodeAttribute(
      node,
      'x',
      (Number.isFinite(x) ? x - centreX : 0) * factor
    );
    graph.setNodeAttribute(
      node,
      'y',
      (Number.isFinite(y) ? y - centreY : 0) * factor
    );
  });

  return factor;
}
