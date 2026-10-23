import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COLLISION_PADDING,
  FORCE_LAYOUT_SEED,
  IDLE_ALPHA_TARGET,
  IDLE_INTERVAL_MS,
  WAKE_ALPHA_TARGET,
  WAKE_COOLDOWN_MS,
  applyRectangularCollision,
  areaCharge,
  countOverlappingPairs,
  createForceLayout,
  driveForceLayout,
  lcg,
  relationDistance,
  relationStrength,
  relationWeight,
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
  runOne: () => void;
  pending: () => number;
  lastDelay: () => number | undefined;
} {
  let next = 1;
  const queue = new Map<number, { callback: () => void; delay: number | undefined }>();

  function runOne(): void {
    const first = queue.entries().next();

    if (first.done === true) {
      return;
    }

    const [handle, entry] = first.value;

    queue.delete(handle);
    entry.callback();
  }

  return {
    scheduler: {
      request(callback: () => void, delayMs?: number): number {
        const handle = next;

        next += 1;
        queue.set(handle, { callback, delay: delayMs });

        return handle;
      },
      cancel(handle: number): void {
        queue.delete(handle);
      }
    },
    drain(): void {
      let guard = 0;

      while (queue.size > 0 && guard < 2000) {
        runOne();
        guard += 1;
      }
    },
    runOne,
    pending: () => queue.size,
    lastDelay: () => [...queue.values()].at(-1)?.delay
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

/** The greatest distance a card travelled between two pictures. */
function greatestDistance(
  before: ReadonlyMap<string, { x: number; y: number }>,
  after: ReadonlyMap<string, { x: number; y: number }>
): number {
  let greatest = 0;

  for (const [id, place] of after) {
    const last = before.get(id);

    if (last === undefined) {
      continue;
    }

    greatest = Math.max(greatest, Math.hypot(place.x - last.x, place.y - last.y));
  }

  return greatest;
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

  it('breathes at rest: the idle tick moves the cards, and below the threshold', () => {
    const { nodes, edges } = fixture(24);
    const layout = createForceLayout(nodes, edges, { living: true });

    // The spring holds the arrangement: the breath is the only thing left,
    // and it is the sway of the cards around their places.
    layout.step(299);
    layout.setAlphaTarget(IDLE_ALPHA_TARGET);

    const before = layout.positions();

    layout.step(1);

    const moved = greatestDistance(before, layout.positions());

    expect(moved).toBeGreaterThan(0);
    // The threshold of the shape of the exploration view is 1.5 px.
    expect(moved).toBeLessThan(1.5);
  });

  it('moves the idle spring at twelve hertz, and only after the wake cools', () => {
    const { nodes, edges } = fixture(24);
    const layout = createForceLayout(nodes, edges);
    const frames = manualScheduler();
    let clock = 0;

    const driver = driveForceLayout(layout, {
      scheduler: frames.scheduler,
      living: true,
      now: () => clock
    });

    driver.start();

    // The picture is drawn awake: it has to find its shape.
    expect(driver.awake).toBe(true);
    expect(layout.alpha).toBeGreaterThanOrEqual(WAKE_ALPHA_TARGET);

    for (let frame = 0; frame < 10; frame += 1) {
      clock += 16.7;
      frames.runOne();
    }

    expect(driver.awake).toBe(true);

    // The contact is old enough: the spring cools.
    clock += WAKE_COOLDOWN_MS;
    frames.runOne();

    expect(driver.awake).toBe(false);

    // The next frame is an idle one, at the pace of the idle spring.
    const interval = frames.lastDelay() ?? 0;

    expect(interval).toBeGreaterThan(1000 / 15);
    expect(interval).toBeLessThan(1000 / 8);
    expect(interval).toBeCloseTo(IDLE_INTERVAL_MS, 5);

    // Let the idle spring lose the speed of the wake, and then look at one
    // idle tick: it moves, and it stays below the threshold. The cool pulls
    // the picture back to the idle arrangement, and that return is slow at
    // five thousandths of alpha: it is not the breath yet.
    for (let frame = 0; frame < 300; frame += 1) {
      clock += IDLE_INTERVAL_MS;
      frames.runOne();
    }

    const before = layout.positions();

    clock += IDLE_INTERVAL_MS;
    frames.runOne();

    const moved = greatestDistance(before, layout.positions());

    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(1.5);

    driver.stop();
  });

  it('never freezes: a living spring keeps drifting past the cap of a one-pass run', () => {
    const { nodes, edges } = fixture(24);

    // A one-pass spring is capped: the cap is the brake of an animation.
    const onePass = createForceLayout(nodes, edges);
    onePass.step(700);

    // A one-pass spring rests by itself: 300 ticks, and then no more.
    expect(onePass.ticks).toBe(300);
    expect(onePass.settled).toBe(true);

    // The living spring is not capped: the cap would be a freeze in disguise.
    const living = createForceLayout(nodes, edges, { living: true });
    living.setAlphaTarget(IDLE_ALPHA_TARGET);
    living.step(700);

    const before = living.positions();

    living.step(1);

    expect(living.ticks).toBe(701);
    expect(living.settled).toBe(false);
    expect(greatestDistance(before, living.positions())).toBeGreaterThan(0);
  });

  it('never stops while it is alive: the driver keeps asking for frames', () => {
    const { nodes, edges } = fixture(24);
    const layout = createForceLayout(nodes, edges, { living: true });
    const frames = manualScheduler();
    let clock = 0;

    const driver = driveForceLayout(layout, {
      scheduler: frames.scheduler,
      living: true,
      now: () => clock
    });

    driver.start();

    // More frames than the cap of a one-pass spring: the living one is
    // still asking for the next, and its picture has not frozen.
    for (let frame = 0; frame < 800; frame += 1) {
      clock += IDLE_INTERVAL_MS;
      frames.runOne();
    }

    const before = layout.positions();

    clock += IDLE_INTERVAL_MS;
    frames.runOne();

    expect(driver.running).toBe(true);
    expect(frames.pending()).toBe(1);
    expect(layout.ticks).toBeGreaterThan(600);
    expect(driver.settled).toBe(false);
    expect(greatestDistance(before, layout.positions())).toBeGreaterThan(0);

    driver.stop();
  });

  it('wakes on contact and cools back to the idle rhythm after the cooldown', () => {
    const { nodes, edges } = fixture(24);
    const layout = createForceLayout(nodes, edges);
    const frames = manualScheduler();
    let clock = 0;

    const driver = driveForceLayout(layout, {
      scheduler: frames.scheduler,
      living: true,
      now: () => clock
    });

    driver.start();

    // The picture cools once the contact is a cooldown old.
    clock += WAKE_COOLDOWN_MS;
    frames.runOne();

    expect(driver.awake).toBe(false);

    // A touch of the reader wakes it: the alpha jumps to the wake target.
    driver.wake();
    clock += 1;

    expect(driver.awake).toBe(true);
    expect(layout.alpha).toBeGreaterThanOrEqual(WAKE_ALPHA_TARGET);

    // A second of contact keeps it awake; the cool-down is counted from
    // the last contact, not from the first.
    clock += 1000;
    frames.runOne();

    expect(driver.awake).toBe(true);

    clock += WAKE_COOLDOWN_MS;
    frames.runOne();

    expect(driver.awake).toBe(false);

    driver.stop();
  });

  it('pulls a strong relation closer than a weak one', () => {
    const nodes: ForceNodeInput[] = [
      { id: 'left', width: CARD.width, height: CARD.height },
      { id: 'right', width: CARD.width, height: CARD.height }
    ];

    // The weight of a relation is its community score over five, clamped.
    expect(relationWeight(undefined)).toBe(0);
    expect(relationWeight(5)).toBe(1);
    expect(relationWeight(12)).toBe(1);
    expect(relationWeight(-3)).toBe(0);

    const weak = createForceLayout(nodes, [{ source: 'left', target: 'right' }]);
    const strong = createForceLayout(nodes, [
      { source: 'left', target: 'right', communityScore: 5 }
    ]);

    runForceLayoutToRest(weak);
    runForceLayoutToRest(strong);

    const distanceOf = (layout: ReturnType<typeof createForceLayout>): number => {
      const left = layout.positions().get('left');
      const right = layout.positions().get('right');

      return Math.hypot((right?.x ?? 0) - (left?.x ?? 0), (right?.y ?? 0) - (left?.y ?? 0));
    };

    expect(relationDistance(5)).toBeLessThan(relationDistance(undefined));
    expect(relationStrength(5, 1)).toBeGreaterThan(relationStrength(undefined, 1));
    expect(distanceOf(strong)).toBeLessThan(distanceOf(weak));
  });

  it('pins a dragged card, moves its neighbours around it, and keeps its place on release', () => {
    const nodes: ForceNodeInput[] = [
      { id: 'left', width: CARD.width, height: CARD.height, x: -220, y: 0 },
      { id: 'held', width: CARD.width, height: CARD.height, x: 0, y: 0 },
      { id: 'right', width: CARD.width, height: CARD.height, x: 220, y: 0 }
    ];
    const edges: ForceEdgeInput[] = [
      { source: 'left', target: 'held' },
      { source: 'held', target: 'right' }
    ];

    const free = createForceLayout(nodes, edges);
    const held = createForceLayout(nodes, edges);

    runForceLayoutToRest(free);

    const place = { x: -777, y: 555 };
    const neighbourBefore = free.positions().get('left');

    held.pin('held', place);
    runForceLayoutToRest(held);

    const pinned = held.positions().get('held');
    const neighbourAfter = held.positions().get('left');

    // The dragged card does not move.
    expect(pinned).toEqual(place);

    // Its neighbours part around the place it was dragged to.
    expect(
      Math.hypot(
        (neighbourAfter?.x ?? 0) - (neighbourBefore?.x ?? 0),
        (neighbourAfter?.y ?? 0) - (neighbourBefore?.y ?? 0)
      )
    ).toBeGreaterThan(10);

    // The release keeps the place: the next arrangement is pinned to it.
    const released = createForceLayout(nodes, edges, {
      pinned: new Map([['held', place]])
    });

    runForceLayoutToRest(released);

    expect(released.positions().get('held')).toEqual(place);
  });
});
