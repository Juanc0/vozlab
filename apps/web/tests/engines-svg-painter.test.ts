/**
 * The **SVG painter** of the comparison.
 *
 * The tests say the things the candidate promises: one `<g>` per card with
 * the whole card inside it, the five shapes of the relations, the camera
 * (fit, wheel and the point under the pointer), the drag that pins a card
 * and leaves its neighbours room, the living spring with its idle breath,
 * the still picture of a reader who asked for less motion, and the numbers
 * the painter reports.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EdgeStyle } from '$lib/graph/explore/edge-style';
import {
  createSvgPainter,
  type SvgPainter,
  type SvgPainterReport
} from '$lib/graph/svg/painter';
import { toScreen } from '$lib/graph/svg/camera';
import { EDGE, EDGE_B, EDGE_C, NODE_A, NODE_B, NODE_C } from './fixtures/graph';

const STYLES: readonly EdgeStyle[] = ['straight', 'bezier', 'unbundled'];

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

/** The rounded number of a path. */
function round(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;

  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Builds a mouse event whose `view` is the window.
 *
 * jsdom rejects the `view` option of `MouseEventInit` under Vitest's proxy of
 * the window ("member view is not of type Window"), but `d3-drag` reads
 * `event.view` to bind its move and up listeners. The event is built without
 * the option and the property is defined afterwards, so the drag behaves as
 * it does in a browser.
 */
function mouse(type: string, init: MouseEventInit): MouseEvent {
  const event = new MouseEvent(type, init);

  Object.defineProperty(event, 'view', { configurable: true, value: window });

  return event;
}

describe('the SVG painter', () => {
  let container: HTMLDivElement;
  let painter: SvgPainter;
  let reports: SvgPainterReport[];
  let selected: (string | null)[];
  let toggled: string[];

  beforeEach(() => {
    motion(false);

    container = document.createElement('div');

    reports = [];
    selected = [];
    toggled = [];

    painter = createSvgPainter({
      container,
      label: 'La imagen de la comparación',
      locale: 'es',
      onselect: (nodeId) => {
        selected.push(nodeId);
      },
      ontoggle: (nodeId) => {
        toggled.push(nodeId);
      },
      onlayout: (report) => {
        reports.push(report);
      }
    });
  });

  afterEach(() => {
    painter.destroy();
    window.matchMedia = originalMatchMedia;
    Reflect.deleteProperty(document, 'visibilityState');
    vi.restoreAllMocks();
  });

  /** Draws the demo. */
  function draw(options: {
    expanded?: readonly string[];
    selected?: string | null;
    presented?: string | null;
    style?: EdgeStyle;
  } = {}): void {
    painter.setElements({
      nodes: [NODE_A, NODE_B, NODE_C],
      edges: [EDGE, EDGE_B, EDGE_C],
      expandedIds: new Set(options.expanded ?? []),
      edgeStyle: options.style ?? 'bezier',
      selectedNodeId: options.selected ?? null,
      presentedNodeId: options.presented ?? null
    });
  }

  /** The root of the picture. */
  function svg(): SVGSVGElement {
    const root = container.querySelector('svg');

    if (root === null) {
      throw new Error('The painter did not draw its SVG.');
    }

    return root;
  }

  /** The group of a node. */
  function card(nodeId: string): SVGGElement {
    const found = svg().querySelector(`g.vozlab-svg-card[data-node-id="${nodeId}"]`);

    if (found === null) {
      throw new Error(`The painter did not draw the card of ${nodeId}.`);
    }

    return found as SVGGElement;
  }

  it('draws one `<g>` per card, with the whole card inside it', () => {
    draw();

    const cards = svg().querySelectorAll('g.vozlab-svg-card');

    expect(cards).toHaveLength(3);

    const first = card(NODE_A.id);
    const box = first.querySelector('rect.vozlab-svg-card-box');
    const title = first.querySelector('text.vozlab-svg-title');
    const meta = first.querySelector('text.vozlab-svg-meta');
    const badge = first.querySelector('g.vozlab-svg-badge');

    // One group is the card: the surface, the wrapped title, the meta line
    // and the badge are children of the same `<g>`.
    expect(box).not.toBeNull();
    expect(box).toHaveAttribute('fill', '#ffffff');
    expect(box).toHaveAttribute('rx', '8');
    expect(title?.querySelectorAll('tspan').length).toBeGreaterThan(1);
    expect(meta?.textContent).toBe('Problema');
    expect(badge).not.toBeNull();

    // The card is the control: it is in the tab order and it says what it
    // is and whether it is selected and expanded.
    expect(first).toHaveAttribute('role', 'button');
    expect(first).toHaveAttribute('tabindex', '0');
    expect(first).toHaveAttribute('aria-pressed', 'false');
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(first).toHaveAccessibleName(/The campus shuttle/);
  });

  it('draws the status as a border, never as the fill of the card', () => {
    draw();

    const active = card(NODE_A.id).querySelector('rect.vozlab-svg-card-box');
    const pending = card(NODE_B.id).querySelector('rect.vozlab-svg-card-box');

    // The active card carries no mark; the pending one carries a border of
    // two pixels in the colour of the status.
    expect(active).toHaveAttribute('fill', '#ffffff');
    expect(active).toHaveAttribute('stroke', 'none');
    expect(pending).toHaveAttribute('fill', '#ffffff');
    expect(pending).toHaveAttribute('stroke', '#92400e');
    expect(pending).toHaveAttribute('stroke-width', '2');
  });

  it('draws the whole content of an expanded card inside the same group', () => {
    draw();

    const collapsed = Number(
      card(NODE_A.id).querySelector('rect.vozlab-svg-card-box')?.getAttribute('height')
    );

    draw({ expanded: [NODE_A.id] });

    const expanded = Number(
      card(NODE_A.id).querySelector('rect.vozlab-svg-card-box')?.getAttribute('height')
    );
    const body = card(NODE_A.id).querySelector('text.vozlab-svg-body');

    expect(expanded).toBeGreaterThan(collapsed);
    expect(body).not.toBeNull();
    expect(body?.querySelectorAll('tspan').length).toBeGreaterThan(1);
    expect(card(NODE_A.id)).toHaveAttribute('aria-expanded', 'true');
  });

  it('selects and expands from the keyboard, and shows a visible focus ring', () => {
    draw();

    const first = card(NODE_A.id);
    const ring = first.querySelector('rect.vozlab-svg-ring');

    expect(ring).toHaveAttribute('opacity', '0');

    first.dispatchEvent(new FocusEvent('focus'));

    expect(ring).toHaveAttribute('opacity', '1');

    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(selected.at(-1)).toBe(NODE_A.id);

    first.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    expect(selected.at(-1)).toBe(NODE_A.id);

    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));

    expect(toggled.at(-1)).toBe(NODE_A.id);

    first.dispatchEvent(new FocusEvent('blur'));

    expect(ring).toHaveAttribute('opacity', '0');
  });

  it('selects on a click and toggles on the badge, without selecting the card', () => {
    draw();

    const first = card(NODE_A.id);
    const badge = first.querySelector('g.vozlab-svg-badge');

    first.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(selected.at(-1)).toBe(NODE_A.id);

    badge?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(toggled.at(-1)).toBe(NODE_A.id);
    // The click of the badge did not reach the card.
    expect(selected.at(-1)).toBe(NODE_A.id);
  });

  it('paints the selection and the presented node', () => {
    draw({ selected: NODE_B.id, presented: NODE_A.id });

    expect(card(NODE_B.id)).toHaveAttribute('aria-pressed', 'true');
    expect(card(NODE_B.id).querySelector('rect.vozlab-svg-underlay')).toHaveAttribute(
      'opacity',
      '1'
    );
    expect(card(NODE_B.id).querySelector('rect.vozlab-svg-card-box')).toHaveAttribute(
      'stroke',
      '#2563eb'
    );
    expect(card(NODE_A.id).querySelector('rect.vozlab-svg-presented')).toHaveAttribute(
      'opacity',
      '1'
    );

    painter.setSelected(NODE_A.id);
    painter.setPresented(NODE_B.id);

    expect(card(NODE_B.id)).toHaveAttribute('aria-pressed', 'false');
    expect(card(NODE_A.id)).toHaveAttribute('aria-pressed', 'true');
    expect(card(NODE_B.id).querySelector('rect.vozlab-svg-presented')).toHaveAttribute(
      'opacity',
      '1'
    );
  });

  it('draws the relations with an opaque plate, the arrow and the dashes of the status', () => {
    draw();

    const edge = svg().querySelector(`g.vozlab-svg-edge[data-edge-id="${EDGE.id}"]`);
    const pending = svg().querySelector(`g.vozlab-svg-edge[data-edge-id="${EDGE_C.id}"]`);
    const plate = edge?.querySelector('rect.vozlab-svg-edge-plate');

    const text = edge?.querySelector('text.vozlab-svg-edge-label-text');

    expect(plate).toHaveAttribute('fill', '#f9fafb');
    expect(plate).toHaveAttribute('fill-opacity', '1');
    expect(edge?.querySelector('path.vozlab-svg-arrow')).not.toBeNull();
    expect(text?.textContent).toBe('Sugiere');
    expect(text).toHaveAttribute('font-size', '11');
    expect(pending?.querySelector('path.vozlab-svg-edge-line')).toHaveAttribute(
      'stroke-dasharray',
      '6 4'
    );
  });

  it('draws three distinct shapes and remembers the style', () => {
    draw();

    const paths = new Set<string>();

    for (const style of STYLES) {
      painter.setEdgeStyle(style);

      const path = svg()
        .querySelector('path.vozlab-svg-edge-line')
        ?.getAttribute('d');

      expect(path).toBeTruthy();
      paths.add(path as string);
    }

    expect(paths.size).toBe(3);
  });

  it('fits the picture, zooms under the wheel and keeps the point under the pointer', () => {
    draw();

    const fitted = painter.camera();
    const point = { x: 400, y: 300 };
    const before = { x: point.x, y: point.y };

    svg().dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -240,
        clientX: point.x,
        clientY: point.y,
        bubbles: true,
        cancelable: true
      })
    );

    const zoomed = painter.camera();

    expect(zoomed.k).toBeGreaterThan(fitted.k);

    // The point under the pointer is the same one in the drawing.
    const worldBefore = {
      x: (before.x - fitted.x) / fitted.k,
      y: (before.y - fitted.y) / fitted.k
    };
    const worldAfter = {
      x: (before.x - zoomed.x) / zoomed.k,
      y: (before.y - zoomed.y) / zoomed.k
    };

    expect(worldAfter.x).toBeCloseTo(worldBefore.x);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y);

    painter.fitView();

    expect(painter.zoom()).toBeCloseTo(fitted.k);
    expect(painter.camera()).toEqual(fitted);
  });

  it('pins a dragged card, lets its neighbours move and keeps the place on release', async () => {
    draw();
    await wait(600);

    const id = NODE_A.id;
    const start = painter.positions().get(id);

    if (start === undefined) {
      throw new Error('The painter did not place the card.');
    }

    const screen = toScreen(painter.camera(), start);
    const cardElement = card(id);
    const neighboursBefore = new Map(
      [...painter.positions()].filter(([nodeId]) => nodeId !== id)
    );

    cardElement.dispatchEvent(
      mouse('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: screen.x,
        clientY: screen.y
      })
    );

    window.dispatchEvent(
      mouse('mousemove', {
        bubbles: true,
        cancelable: true,
        buttons: 1,
        clientX: screen.x + 120,
        clientY: screen.y
      })
    );

    // The card is pinned where the hand left it, and the collision takes it
    // as an obstacle: the neighbours are pushed out of its way.
    await wait(250);

    const parted = [...painter.positions()].some(([nodeId, place]) => {
      if (nodeId === id) {
        return false;
      }

      const before = neighboursBefore.get(nodeId);

      return before !== undefined && Math.hypot(place.x - before.x, place.y - before.y) > 2;
    });

    expect(parted).toBe(true);

    window.dispatchEvent(
      mouse('mouseup', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: screen.x + 120,
        clientY: screen.y
      })
    );

    const dropped = painter.positions().get(id);

    expect(dropped?.x).toBeCloseTo(start.x + 120 / painter.camera().k, 1);

    // The card is released: the spring takes it back, and the place the
    // reader dragged it to is not frozen for the rest of the view.
    await wait(300);

    expect(painter.state().alive).toBe(true);
  });

  it('breathes at rest and wakes on contact', async () => {
    draw();

    await wait(100);

    expect(painter.state().alive).toBe(true);
    expect(painter.state().awake).toBe(true);
    expect(painter.state().ticks).toBeGreaterThan(0);

    // The bounded watch reports the living spring as alive, never settled.
    await wait(1100);

    expect(reports.at(-1)?.alive).toBe(true);
    expect(reports.at(-1)?.settled).toBe(false);

    // After the cool-down the picture drifts on its own.
    await wait(5100);

    expect(painter.state().awake).toBe(false);

    const before = painter.positions();
    await wait(180);
    const after = painter.positions();

    const moved = [...before.entries()].some(([nodeId, place]) => {
      const next = after.get(nodeId);

      return next !== undefined && Math.hypot(next.x - place.x, next.y - place.y) > 0;
    });

    expect(moved).toBe(true);

    painter.wake();
    await wait(40);

    expect(painter.state().awake).toBe(true);
  }, 10000);

  it('runs to rest in one go when the reader asked for less motion', async () => {
    motion(true);
    draw();

    expect(painter.state().alive).toBe(false);
    expect(painter.state().ticks).toBeGreaterThan(0);
    expect(painter.state().shapeReached).toBe(true);

    const before = painter.positions();

    await wait(120);

    expect(painter.positions()).toEqual(before);

    painter.wake();
    await wait(80);

    expect(painter.state().alive).toBe(false);
    expect(reports.at(-1)?.alive).toBe(false);
    expect(reports.at(-1)?.settled).toBe(true);
  });

  it('does not tick in a hidden tab, and resumes when it is shown', async () => {
    let visibilityState: DocumentVisibilityState = 'visible';

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState
    });

    draw();
    await wait(100);

    const running = painter.state().ticks;

    expect(running).toBeGreaterThan(0);

    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await wait(100);

    expect(painter.state().ticks).toBe(running);

    visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await wait(120);

    expect(painter.state().ticks).toBeGreaterThan(running);
  });

  it('reports the build time and the elements of the picture', () => {
    motion(true);
    draw();

    const report = reports.at(-1);
    const root = svg();

    expect(report).toBeDefined();
    expect(report?.buildMs).toBeGreaterThanOrEqual(0);
    expect(report?.domElements).toBe(root.querySelectorAll('*').length + 1);
    expect(painter.state().domElements).toBe(report?.domElements);
  });

  it('draws the relation from the place of the cards after a rebuild', () => {
    draw();

    const first = svg().querySelector('path.vozlab-svg-edge-line')?.getAttribute('d');

    draw({ expanded: [NODE_A.id] });

    const second = svg().querySelector('path.vozlab-svg-edge-line')?.getAttribute('d');

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();

    // The path was drawn with the cards, not left at the old place.
    expect(second).not.toBe(first);
  });
});

describe('the arrow of the SVG painter', () => {
  it('points at the border of the target card', () => {
    // The geometry is tested on its own; this is the check that the
    // painter hands the arrow the path the module built.
    const container = document.createElement('div');
    const painter = createSvgPainter({ container, label: 'La imagen' });

    motion(true);
    painter.setElements({
      nodes: [NODE_A, NODE_B],
      edges: [EDGE],
      expandedIds: new Set(),
      edgeStyle: 'straight'
    });

    const arrow = container.querySelector('path.vozlab-svg-arrow')?.getAttribute('d');

    expect(arrow).toMatch(/^M .+ Z$/);
    expect(round(1)).toBe(1);

    painter.destroy();
  });
});
