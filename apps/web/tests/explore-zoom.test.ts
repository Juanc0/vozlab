/**
 * The zoom of the picture, and the walk that re-centres it.
 *
 * The zoom is a property of the **view**, and the view belongs to the
 * reader: it starts at the **fit** — the whole graph in view — and the
 * wheel changes it. Walking does not touch it: a walk moves the picture,
 * with a smooth progression, and the zoom stays.
 *
 * The tests drive the instance with the fake core of the harness: the
 * viewport of the fake is a model of what the reader sees.
 */

import { render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ZoomControls from '$lib/components/ZoomControls.svelte';
import {
  createExplorationInstance,
  type ExplorationInstance
} from '$lib/graph/explore/instance';
import { clampZoom, MAX_ZOOM, MIN_ZOOM } from '$lib/graph/explore/zoom';
import { EDGE, EDGE_C, NODE_A, NODE_B, NODE_C } from './fixtures/graph';
import { createFakeCore, type FakeCore } from './harness/cytoscape';
import { localeContext } from './harness/locale';

/** Cytoscape needs a `<canvas>`; jsdom has none. The module is mocked. */
const { cytoscapeMock } = vi.hoisted(() => {
  const factory = vi.fn();
  return { cytoscapeMock: Object.assign(factory, { use: vi.fn() }) };
});

vi.mock('cytoscape', () => ({ default: cytoscapeMock }));

/** The zoom the fit of the picture of the harness gives. */
const FIT_ZOOM = 0.42;

/**
 * Makes the reader ask for — or not ask for — less motion.
 *
 * @param reduced - Whether the reader asked for less motion.
 */
function motion(reduced: boolean): void {
  window.matchMedia = vi.fn(() => ({ matches: reduced })) as unknown as typeof window.matchMedia;
}

describe('the zoom of the picture', () => {
  let core: FakeCore;
  let instance: ExplorationInstance;
  let reported: number[];

  beforeEach(() => {
    // The reader has not asked for less motion: the movement is seen.
    motion(false);

    core = createFakeCore({ fitZoom: FIT_ZOOM });
    cytoscapeMock.mockReset();
    cytoscapeMock.use.mockReset();
    cytoscapeMock.mockReturnValue(core.core);

    reported = [];

    instance = createExplorationInstance({
      container: document.createElement('div'),
      onselect: () => undefined,
      onselectedge: () => undefined,
      onpreview: () => undefined,
      ondrag: () => undefined,
      onrender: () => undefined,
      onzoom: (zoom) => {
        reported.push(zoom);
      }
    });
  });

  afterEach(() => {
    instance.destroy();
    vi.restoreAllMocks();
  });

  /** Draws a picture on the canvas. */
  function draw(nodes: typeof NODE_A[], presented: string | null = null): void {
    instance.setElements(nodes, [EDGE], {
      expandedIds: new Set<string>(),
      expandedEdgeIds: new Set<string>(),
      edgeStyle: 'bezier',
      presentedNodeId: presented,
      pinned: new Map(),
      // The layered arrangement is **synchronous**: the test does not have
      // to wait for the frames of a simulation.
      layout: 'dagre'
    });
  }

  it('starts at the fit: the whole graph is in view', () => {
    draw([NODE_A, NODE_B]);

    expect(core.viewport.zoom).toBe(FIT_ZOOM);
    expect(instance.zoom()).toBe(FIT_ZOOM);
    expect(reported.at(-1)).toBe(FIT_ZOOM);
  });

  it('is the reader’s: the wheel changes it', () => {
    draw([NODE_A, NODE_B]);

    // The wheel of the reader: the renderer changed the zoom of the
    // viewport and the canvas says so.
    core.viewport.zoom = 0.9;
    core.emit('zoom');

    expect(instance.zoom()).toBe(0.9);
    expect(reported.at(-1)).toBe(0.9);
  });

  it('is not imposed again when the picture changes', () => {
    draw([NODE_A, NODE_B]);

    core.viewport.zoom = 0.9;
    core.emit('zoom');

    // A new window: the picture grows, and the zoom of the reader stays.
    draw([NODE_A, NODE_B, NODE_C]);

    expect(core.viewport.zoom).toBe(0.9);
    expect(instance.zoom()).toBe(0.9);
  });

  it('does not change when the reader walks', () => {
    draw([NODE_A, NODE_B]);

    core.viewport.zoom = 0.9;
    core.emit('zoom');

    const before = instance.zoom();

    // The walk: the neighbourhood of the node that was clicked arrives.
    instance.setElements([NODE_A, NODE_B, NODE_C], [EDGE, EDGE_C], {
      expandedIds: new Set<string>(),
      expandedEdgeIds: new Set<string>(),
      edgeStyle: 'bezier',
      presentedNodeId: NODE_C.id,
      pinned: new Map(),
      layout: 'dagre'
    });

    expect(instance.zoom()).toBe(before);
  });

  it('keeps the zoom of the reader when the view is opened again', () => {
    // The reader chose a zoom in the other view of the graph: the view
    // opens with it, and the fit only finds the place of the picture.
    const chosen = createExplorationInstance({
      container: document.createElement('div'),
      onselect: () => undefined,
      onselectedge: () => undefined,
      onpreview: () => undefined,
      ondrag: () => undefined,
      onrender: () => undefined,
      zoom: 0.5
    });

    chosen.setElements([NODE_A, NODE_B], [EDGE], {
      expandedIds: new Set<string>(),
      expandedEdgeIds: new Set<string>(),
      edgeStyle: 'bezier',
      presentedNodeId: null,
      pinned: new Map(),
      layout: 'dagre'
    });

    expect(chosen.zoom()).toBe(0.5);

    chosen.destroy();
  });

  it('is fitted again when the reader asks for it', () => {
    draw([NODE_A, NODE_B]);

    core.viewport.zoom = 0.9;
    core.emit('zoom');

    instance.fitView();

    expect(instance.zoom()).toBe(FIT_ZOOM);
  });

  it('stays inside the range of the reader', () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(MIN_ZOOM);
    expect(clampZoom(0.5)).toBe(0.5);
  });
});

describe('the walk that re-centres the picture', () => {
  let core: FakeCore;
  let instance: ExplorationInstance;

  beforeEach(() => {
    // The reader has not asked for less motion: the movement is seen.
    motion(false);

    core = createFakeCore({ fitZoom: FIT_ZOOM });
    cytoscapeMock.mockReset();
    cytoscapeMock.use.mockReset();
    cytoscapeMock.mockReturnValue(core.core);

    instance = createExplorationInstance({
      container: document.createElement('div'),
      onselect: () => undefined,
      onselectedge: () => undefined,
      onpreview: () => undefined,
      ondrag: () => undefined,
      onrender: () => undefined
    });
  });

  afterEach(() => {
    instance.destroy();
    vi.restoreAllMocks();
  });

  /** Draws a picture and walks to a node. */
  function walk(presented: string): void {
    instance.setElements([NODE_A, NODE_B], [EDGE], {
      expandedIds: new Set<string>(),
      expandedEdgeIds: new Set<string>(),
      edgeStyle: 'bezier',
      presentedNodeId: null,
      pinned: new Map(),
      layout: 'dagre'
    });

    instance.setElements([NODE_A, NODE_B, NODE_C], [EDGE, EDGE_C], {
      expandedIds: new Set<string>(),
      expandedEdgeIds: new Set<string>(),
      edgeStyle: 'bezier',
      presentedNodeId: presented,
      pinned: new Map(),
      layout: 'dagre'
    });
  }

  it('moves the picture with an eased animation', () => {
    walk(NODE_C.id);

    const animation = core.animations.at(-1);

    expect(animation).toBeDefined();
    expect(animation?.options['duration']).toBe(320);
    expect(animation?.options['easing']).toBe('ease-in-out-cubic');
  });

  it('moves the picture over more than one frame, and ends on the node', async () => {
    walk(NODE_C.id);

    const zoom = core.viewport.zoom;
    const seen: string[] = [];

    for (let frame = 0; frame < 8; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));

      seen.push(`${core.viewport.pan.x},${core.viewport.pan.y}`);
    }

    // The movement is seen: the picture is not in one place and then in
    // another one.
    expect(new Set(seen).size).toBeGreaterThan(1);

    // The zoom is not touched by the walk.
    expect(core.viewport.zoom).toBe(zoom);

    // The picture ends centred on the node the reader walked to.
    const node = core.nodes.get(NODE_C.id);
    const rendered = (node?.position.x ?? 0) * core.viewport.zoom + core.viewport.pan.x;

    expect(rendered).toBeCloseTo(400, 5);
  });

  it('corrects the pan once when the living spring moves the node under it', async () => {
    walk(NODE_C.id);

    // The bounded watch ended at its deadline: the spring is still cooling,
    // and the node moves while the pan is under way.
    const node = core.nodes.get(NODE_C.id);

    if (node === undefined) {
      throw new Error('the node of the walk is missing');
    }

    node.position.x += 100;

    for (let frame = 0; frame < 10; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    // The walk took a second eased pan: the first one ended where the node
    // was, and the node was no longer there.
    expect(core.animations).toHaveLength(2);
    expect(core.animations.at(-1)?.options['easing']).toBe('ease-in-out-cubic');

    // The picture still ends centred, and the zoom is still the reader's.
    const rendered = node.position.x * core.viewport.zoom + core.viewport.pan.x;

    expect(rendered).toBeCloseTo(400, 5);
  });

  it('never chases the idle drift of the spring after the walk', async () => {
    walk(NODE_C.id);

    for (let frame = 0; frame < 8; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    expect(core.animations).toHaveLength(1);

    const node = core.nodes.get(NODE_C.id);

    if (node === undefined) {
      throw new Error('the node of the walk is missing');
    }

    // The spring breathes at rest: the node moves a little, and the view
    // does not follow it. The walk is over.
    node.position.x += 20;
    node.position.y -= 20;

    for (let frame = 0; frame < 8; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    expect(core.animations).toHaveLength(1);
  });

  it('puts the picture in its place at once when the reader asked for less motion', () => {
    motion(true);

    walk(NODE_C.id);

    // No animation: the picture is centred at once.
    expect(core.animations).toHaveLength(0);

    const node = core.nodes.get(NODE_C.id);
    const rendered = (node?.position.x ?? 0) * core.viewport.zoom + core.viewport.pan.x;

    expect(rendered).toBeCloseTo(400, 5);
  });
});

describe('the controls of the zoom', () => {
  it('are quiet buttons that say what they do', async () => {
    const zooms: string[] = [];

    render(ZoomControls, {
      context: localeContext(),
      props: {
        onzoomin: () => zooms.push('in'),
        onzoomout: () => zooms.push('out'),
        onfit: () => zooms.push('fit')
      }
    });

    const group = screen.getByRole('group', { name: 'El zoom de la imagen' });

    expect(group).toBeInTheDocument();

    const zoomIn = screen.getByRole('button', { name: 'Acercar la imagen' });
    const zoomOut = screen.getByRole('button', { name: 'Alejar la imagen' });
    const fit = screen.getByRole('button', { name: 'Ver el grafo entero' });

    zoomIn.click();
    zoomOut.click();
    fit.click();

    expect(zooms).toEqual(['in', 'out', 'fit']);
  });
});
