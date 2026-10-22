import { describe, expect, it } from 'vitest';
import {
  IDLE_ALPHA_TARGET,
  createForceLayout,
  runForceLayoutToRest,
  type ForceEdgeInput,
  type ForceNodeInput
} from '$lib/graph/explore/force-layout';

/**
 * The **measurements** of the spring.
 *
 * They are the numbers the comparison of the engines shows, measured
 * without a canvas: the module is pure, and a pure module can be measured
 * in a test.
 *
 * The test does not fail on a slow machine: it fails when the spring does
 * not do its work (a card on top of another one) or when the cost of a
 * tick grows with the square of the number of the cards (the spatial grid
 * of the collision is there for that).
 */

/** The size of the card of the fixture. */
const CARD = { width: 140, height: 60 };

/**
 * A deterministic picture of `count` cards.
 *
 * The relations are a chain with a chord every seven nodes: the picture is
 * a graph and not a cloud, and it is the same one on every run.
 */
function fixture(count: number): {
  nodes: ForceNodeInput[];
  edges: ForceEdgeInput[];
} {
  const nodes: ForceNodeInput[] = [];

  for (let index = 0; index < count; index += 1) {
    nodes.push({
      id: `node-${index.toString().padStart(4, '0')}`,
      width: CARD.width,
      height: CARD.height
    });
  }

  const edges: ForceEdgeInput[] = [];

  for (let index = 1; index < count; index += 1) {
    edges.push({
      source: `node-${(index - 1).toString().padStart(4, '0')}`,
      target: `node-${index.toString().padStart(4, '0')}`
    });

    if (index % 7 === 0) {
      edges.push({
        source: `node-${(index - 3).toString().padStart(4, '0')}`,
        target: `node-${index.toString().padStart(4, '0')}`
      });
    }
  }

  return { nodes, edges };
}

/** The cost of a tick, in milliseconds. */
function costPerTick(count: number, ticks = 20): number {
  const { nodes, edges } = fixture(count);
  const layout = createForceLayout(nodes, edges);

  // The first ticks are the warm-up: the simulation builds what it had
  // not built yet.
  layout.step(5);

  const began = performance.now();

  layout.step(ticks);

  return (performance.now() - began) / ticks;
}

describe('the measurements of the spring', () => {
  it('settles two hundred cards without one pair on top of another', () => {
    const { nodes, edges } = fixture(200);
    const layout = createForceLayout(nodes, edges);
    const result = runForceLayoutToRest(layout);

    console.log(
      `200 cards: ${result.ticks} ticks, ${result.ms} ms of simulation, ${result.overlaps} overlapping pairs`
    );

    expect(result.settled).toBe(true);
    expect(result.overlaps).toBe(0);
    // The picture settles by its own criterion, and not by the ceiling.
    expect(result.ticks).toBeLessThanOrEqual(300);
  });

  it('costs a fraction of a millisecond a tick at two hundred cards', () => {
    const perTick = costPerTick(200);

    console.log(`200 cards: ${perTick.toFixed(3)} ms a tick`);

    // The number is a **measurement**, and not a gate: the machine that
    // runs the suite may be busy. The gate is loose on purpose — a tick
    // that took a whole frame would be a bug, and a tick that took a
    // millisecond more is not.
    expect(perTick).toBeLessThan(20);
  });

  it('does not grow with the square of the number of the cards', () => {
    const at200 = costPerTick(200);
    const at1000 = costPerTick(1000, 10);

    console.log(
      `200 cards: ${at200.toFixed(3)} ms a tick · 1000 cards: ${at1000.toFixed(3)} ms a tick`
    );

    // Five times the cards, and much less than five times the time: the
    // collision of the cards is looked up in a grid, and not in a walk
    // over every card. The bound is loose: the machine that runs the
    // suite may be busy.
    expect(at1000).toBeLessThan(at200 * 20);
  }, 30000);

  it('breathes at rest below the threshold, and the idle tick stays inside a frame', () => {
    const { nodes, edges } = fixture(200);
    const layout = createForceLayout(nodes, edges, { living: true });

    // The picture is almost at rest: the breath is all that is left.
    layout.step(299);
    layout.setAlphaTarget(IDLE_ALPHA_TARGET);

    const previous = new Map(
      [...layout.positions()].map(([id, place]) => [id, { x: place.x, y: place.y }])
    );

    let greatest = 0;
    let moved = 0;
    let tickMs = 0;

    for (let tick = 0; tick < 20; tick += 1) {
      const began = performance.now();

      layout.step(1);

      const places = layout.positions();

      tickMs += performance.now() - began;

      let step = 0;

      places.forEach((place, id) => {
        const last = previous.get(id);

        if (last === undefined) {
          return;
        }

        step = Math.max(step, Math.hypot(place.x - last.x, place.y - last.y));
        last.x = place.x;
        last.y = place.y;
      });

      greatest = Math.max(greatest, step);
      moved += step;
    }

    const perTick = tickMs / 20;

    console.log(
      `idle breath at 200 cards: ${perTick.toFixed(3)} ms a tick, ${greatest.toFixed(3)} px a tick (greatest)`
    );

    // The breath is real: the picture moves.
    expect(moved).toBeGreaterThan(0);
    // And it stays below the threshold of the shape (1.5 px).
    expect(greatest).toBeLessThan(1.5);
    // The idle tick stays inside a frame; the gate is the same loose one of
    // the measurement above, because the machine that runs the suite may be
    // busy.
    expect(perTick).toBeLessThan(20);
  }, 30000);
});
