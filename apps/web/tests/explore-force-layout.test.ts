import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COLLISION_PADDING,
  FORCE_LAYOUT_SEED,
  applyRectangularCollision,
  areaCharge,
  countOverlappingPairs,
  createForceLayout,
  driveForceLayout,
  lcg,
  runForceLayoutToRest,
  type ForceEdgeInput,
  type ForceNode,
  type ForceNodeInput,
  type FrameScheduler
} from '$lib/graph/explore/force-layout';

/** The size of the card of the fixture. */
const CARD = { width: 140, height: 60 };

/**
 * A deterministic picture of `count` cards.
 *
 * The relations are a chain with a few chords: the picture is a graph and
 * not a cloud, and it is the same one on every run.
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
    edges.push({ source: `node-${(index - 1).toString().padStart(4, '0')}`, target: `node-${index.toString().padStart(4, '0')}` });

    if (index % 7 === 0) {
      edges.push({
        source: `node-${(index - 3).toString().padStart(4, '0')}`,
        target: `node-${index.toString().padStart(4, '0')}`
      });
    }
  }

  return { nodes, edges };
}

/** A scheduler of frames that the test drives by hand. */
function manualScheduler(): {
  scheduler: FrameScheduler;
  drain: () => void;
  pending: () => number;
} {
  let next = 1;
  const queue = new Map<number, () => void>();

  return {
    scheduler: {
      request(callback: () => void): number {
        const handle = next;

        next += 1;
        queue.set(handle, callback);

        return handle;
      },
      cancel(handle: number): void {
        queue.delete(handle);
      }
    },
    drain(): void {
      let guard = 0;

      while (queue.size > 0 && guard < 2000) {
        const first = queue.entries().next();

        if (first.done === true) {
          return;
        }

        const [handle, callback] = first.value;

        queue.delete(handle);
        callback();
        guard += 1;
      }
    },
    pending: () => queue.size
  };
}

/** A node of the collision, as the test builds it. */
function box(
  id: string,
  x: number,
  y: number,
  width = CARD.width,
  height = CARD.height
): ForceNode {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    index: Number(id.replace('box-', '')),
    fx: null,
    fy: null,
    width,
    height,
    mass: width * height
  };
}

describe('the spring of the exploration view', () => {
  it('is pure: it runs without a canvas and without Cytoscape', () => {
    const before = document.body.childElementCount;

    const { nodes, edges } = fixture(24);
    const layout = createForceLayout(nodes, edges);

    layout.step(10);

    // No canvas, no element: the module answers with numbers.
    expect(document.querySelector('canvas')).toBeNull();
    expect(document.body.childElementCount).toBe(before);
  });

  it('is deterministic: two runs give exactly the same places', () => {
    const { nodes, edges } = fixture(60);

    const first = runForceLayoutToRest(createForceLayout(nodes, edges));
    const second = runForceLayoutToRest(createForceLayout(nodes, edges));

    expect(first.ticks).toBe(second.ticks);

    for (const [id, place] of first.positions) {
      const other = second.positions.get(id);

      expect(other, `${id} is in both pictures`).toBeDefined();
      // Exactly, not with a tolerance: the picture is the same one.
      expect(other?.x).toBe(place.x);
      expect(other?.y).toBe(place.y);
    }
  });

  it('uses a seeded generator', () => {
    const generator = lcg(FORCE_LAYOUT_SEED);

    expect(generator()).toBe(lcg(FORCE_LAYOUT_SEED)());
    expect(generator()).toBeGreaterThanOrEqual(0);
    expect(generator()).toBeLessThan(1);
  });

  it('leaves no card on top of another one: two hundred cards, zero pairs', () => {
    const { nodes, edges } = fixture(200);
    const layout = createForceLayout(nodes, edges);
    const result = runForceLayoutToRest(layout);

    expect(result.settled).toBe(true);
    expect(result.overlaps).toBe(0);
    expect(countOverlappingPairs(layout.nodes)).toBe(0);
  });

  it('pushes two overlapping cards apart along the axis of the least penetration', () => {
    // The cards overlap by forty pixels on the x axis and by sixty on the
    // y axis: the shortest way out is the x axis.
    const first = box('box-0', 0, 0);
    const second = box('box-1', 100, 0);

    const corrected = applyRectangularCollision([first, second], 0, 1);

    expect(corrected).toBe(1);
    // Half of the overlap each: the separation is symmetric.
    expect(first.x).toBe(-20);
    expect(second.x).toBe(120);
    expect(first.y).toBe(0);
    expect(second.y).toBe(0);
  });

  it('does not move two cards that do not overlap', () => {
    const first = box('box-0', 0, 0);
    const second = box('box-1', 400, 0);

    const corrected = applyRectangularCollision([first, second], 0, 1);

    expect(corrected).toBe(0);
    expect(first.x).toBe(0);
    expect(second.x).toBe(400);
  });

  it('keeps the room the padding asks for', () => {
    // The cards are touching: the padding asks for eight pixels more.
    const first = box('box-0', 0, 0);
    const second = box('box-1', 140, 0);

    applyRectangularCollision([first, second], DEFAULT_COLLISION_PADDING, 1);

    expect(first.x).toBe(-(DEFAULT_COLLISION_PADDING / 2));
    expect(second.x).toBe(140 + DEFAULT_COLLISION_PADDING / 2);
  });

  it('charges a card by its area', () => {
    const small = areaCharge(20 * 20);
    const card = areaCharge(CARD.width * CARD.height);
    const big = areaCharge(280 * 120);

    expect(card).toBeLessThan(0);
    expect(Math.abs(small)).toBeLessThan(Math.abs(card));
    expect(Math.abs(big)).toBeGreaterThan(Math.abs(card));
    // Twice the area, twice the charge.
    expect(areaCharge(2 * CARD.width * CARD.height)).toBeCloseTo(2 * card, 10);
  });

  it('comes to rest and stops: nothing runs after the picture settles', () => {
    const { nodes, edges } = fixture(120);
    const layout = createForceLayout(nodes, edges);
    const frames = manualScheduler();
    const driver = driveForceLayout(layout, { scheduler: frames.scheduler, ticksPerFrame: 4 });

    driver.start();
    frames.drain();

    expect(layout.settled).toBe(true);
    expect(driver.settled).toBe(true);
    expect(driver.running).toBe(false);
    // No frame is left: the animation is over.
    expect(frames.pending()).toBe(0);
  });

  it('runs the picture in one go with less motion, and it is the same picture', () => {
    const { nodes, edges } = fixture(80);

    const animated = createForceLayout(nodes, edges);
    const frames = manualScheduler();
    const driver = driveForceLayout(animated, { scheduler: frames.scheduler, ticksPerFrame: 3 });

    driver.start();
    frames.drain();

    const straight = createForceLayout(nodes, edges);
    const result = runForceLayoutToRest(straight);

    expect(result.ticks).toBe(animated.ticks);

    for (const [id, place] of result.positions) {
      const other = animated.positions().get(id);

      expect(other?.x).toBe(place.x);
      expect(other?.y).toBe(place.y);
    }
  });

  it('keeps the place of a card that was dragged', () => {
    const { nodes, edges } = fixture(40);
    const pinned = new Map([[nodes[3]?.id ?? '', { x: -777, y: 555 }]]);
    const layout = createForceLayout(nodes, edges, { pinned });

    runForceLayoutToRest(layout);

    const place = layout.positions().get(nodes[3]?.id ?? '');

    expect(place?.x).toBe(-777);
    expect(place?.y).toBe(555);
  });

  it('keeps the place of a card the caller says is fixed', () => {
    const nodes: ForceNodeInput[] = [
      { id: 'fixed', width: 140, height: 60, x: 10, y: 20, pinned: true },
      { id: 'free', width: 140, height: 60 }
    ];

    const layout = createForceLayout(nodes, [{ source: 'fixed', target: 'free' }]);

    runForceLayoutToRest(layout);

    const place = layout.positions().get('fixed');

    expect(place?.x).toBe(10);
    expect(place?.y).toBe(20);
  });

  it('moves the picture around a card that was dragged', () => {
    const { nodes, edges } = fixture(40);

    const free = createForceLayout(nodes, edges);
    const pinned = new Map([[nodes[3]?.id ?? '', { x: -777, y: 555 }]]);
    const held = createForceLayout(nodes, edges, { pinned });

    runForceLayoutToRest(free);
    runForceLayoutToRest(held);

    const freePlace = free.positions().get(nodes[0]?.id ?? '');
    const heldPlace = held.positions().get(nodes[0]?.id ?? '');

    expect(freePlace?.x).not.toBe(heldPlace?.x);
  });
});
