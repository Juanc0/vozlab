/**
 * The **living spring** of the exploration view.
 *
 * The spring does not stop: it breathes at rest, it wakes when the reader
 * touches it and it cools back on its own. The tests drive the real
 * instance with the fake core of the harness — the picture is the same one
 * the reader sees, without a canvas.
 *
 * A reader who asked for less motion gets the same picture in one go, and
 * the spring never wakes. A hidden tab stops the frames of the driver and
 * resumes them where it left them.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createExplorationInstance,
  type ExplorationInstance,
  type LayoutReport
} from '$lib/graph/explore/instance';
import { EDGE, NODE_A, NODE_B } from './fixtures/graph';
import { createFakeCore, type FakeCore } from './harness/cytoscape';

/** Cytoscape needs a `<canvas>`; jsdom has none. The module is mocked. */
const { cytoscapeMock } = vi.hoisted(() => {
  const factory = vi.fn();

  return { cytoscapeMock: Object.assign(factory, { use: vi.fn() }) };
});

vi.mock('cytoscape', () => ({ default: cytoscapeMock }));

/** The original `matchMedia`, put back after every test. */
const originalMatchMedia = window.matchMedia;

/**
 * Makes the reader ask for — or not ask for — less motion.
 *
 * @param reduced - Whether the reader asked for less motion.
 */
function motion(reduced: boolean): void {
  window.matchMedia = vi.fn(() => ({ matches: reduced })) as unknown as typeof window.matchMedia;
}

/** Waits for the frames of the browser. */
async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('the living spring of the exploration view', () => {
  let core: FakeCore;
  let instance: ExplorationInstance;
  let reports: LayoutReport[];

  beforeEach(() => {
    // The reader has not asked for less motion: the spring breathes.
    motion(false);

    core = createFakeCore();
    cytoscapeMock.mockReset();
    cytoscapeMock.use.mockReset();
    cytoscapeMock.mockReturnValue(core.core);

    reports = [];

    instance = createExplorationInstance({
      container: document.createElement('div'),
      onselect: () => undefined,
      onselectedge: () => undefined,
      onpreview: () => undefined,
      ondrag: () => undefined,
      onrender: () => undefined,
      onlayout: (report) => {
        reports.push(report);
      }
    });
  });

  afterEach(() => {
    instance.destroy();
    window.matchMedia = originalMatchMedia;
    Reflect.deleteProperty(document, 'visibilityState');
    vi.restoreAllMocks();
  });

  /** Draws the picture with the living spring. */
  function draw(): void {
    instance.setElements([NODE_A, NODE_B], [EDGE], {
      expandedIds: new Set<string>(),
      expandedEdgeIds: new Set<string>(),
      edgeStyle: 'bezier',
      presentedNodeId: null,
      pinned: new Map(),
      layout: 'd3'
    });
  }

  it('stops the frames of a hidden tab, and resumes them when it is shown', async () => {
    let visibilityState: DocumentVisibilityState = 'visible';

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState
    });

    draw();

    // The spring is drawing: the cards are put in their places frame by
    // frame.
    await wait(80);

    const running = core.placements.length;

    expect(running).toBeGreaterThan(0);

    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));

    await wait(120);

    // Not a frame while the tab is hidden.
    expect(core.placements.length).toBe(running);

    visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));

    await wait(80);

    // The spring resumes where it was.
    expect(core.placements.length).toBeGreaterThan(running);
  });

  it('runs to rest when the reader asked for less motion, and never wakes', async () => {
    motion(true);

    draw();

    const drawn = core.placements.length;

    await wait(120);

    // No driver: not a frame after the arrangement.
    expect(core.placements.length).toBe(drawn);

    instance.wake();

    await wait(120);

    // A touch does not wake a picture that asked for less motion.
    expect(core.placements.length).toBe(drawn);

    const report = reports.at(-1);

    expect(report?.alive).toBe(false);
    expect(report?.settled).toBe(true);
    expect(report?.shapeReached).toBe(true);
  });

  it('reports a living spring as alive: never as settled', async () => {
    draw();

    // The bounded watch reports after the picture finds its shape; the
    // readout keeps following the spring after that. The wait also covers
    // the cool-down, so the last report says the spring is at rest.
    await wait(1800);

    const report = reports.at(-1);

    expect(report?.alive).toBe(true);
    expect(report?.settled).toBe(false);
    expect(report?.threshold).toBeGreaterThan(0);
    expect(report?.awake).toBe(false);
  });
});
