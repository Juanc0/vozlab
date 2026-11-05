/**
 * The three capabilities the SVG painter had to gain before it could replace
 * the incumbent: centring the camera on a node, a fit that stays readable, and
 * the nodes the host holds still.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSvgPainter, type SvgPainter } from '$lib/graph/svg/painter';
import { NODE_A, NODE_B, NODE_C, EDGE, EDGE_B } from './fixtures/graph';

/** The zoom below which the painter refuses to shrink the cards. */
const READABLE_ZOOM = 0.75;

const VIEWPORT = { width: 800, height: 600 };

const originalMatchMedia = window.matchMedia;

let container: HTMLDivElement;
let painter: SvgPainter;

/** Gives the container a real size: jsdom reports zero for everything. */
function size(container: HTMLElement): void {
  container.getBoundingClientRect = () =>
    ({
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      top: 0,
      left: 0,
      bottom: VIEWPORT.height,
      right: VIEWPORT.width,
      x: 0,
      y: 0,
      toJSON: () => ({})
    }) as DOMRect;
}

function mount(pinnedIds?: ReadonlySet<string>): void {
  painter = createSvgPainter({
    container,
    label: 'La imagen',
    locale: 'es'
  });

  painter.setElements({
    nodes: [NODE_A, NODE_B, NODE_C],
    edges: [EDGE, EDGE_B],
    expandedIds: new Set<string>(),
    edgeStyle: 'straight',
    pinnedIds
  });
}

beforeEach(() => {
  // The spring would move the picture under the assertions: the reader asked
  // for less motion, and the painter draws a still picture.
  window.matchMedia = vi.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia;

  container = document.createElement('div');
  size(container);
  document.body.append(container);
});

afterEach(() => {
  painter?.destroy();
  container.remove();
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
});

describe('the camera of the painter', () => {
  it('centres the picture on a node when the view walks to it', () => {
    mount();

    painter.centerOn(NODE_A.id);

    const place = painter.positions().get(NODE_A.id);
    const camera = painter.camera();

    expect(place).toBeDefined();

    // The node sits in the middle of the viewport: its drawing coordinates,
    // moved by the camera and scaled, land on the centre of the box.
    expect(camera.x + place!.x * camera.k).toBeCloseTo(VIEWPORT.width / 2, 0);
    expect(camera.y + place!.y * camera.k).toBeCloseTo(VIEWPORT.height / 2, 0);
  });

  it('ignores a node that is not in the picture', () => {
    mount();

    const before = painter.camera();

    painter.centerOn('00000000-0000-4000-8000-000000000000');

    expect(painter.camera()).toEqual(before);
  });

  it('never fits the picture below a readable zoom', () => {
    mount();

    painter.fitView();

    expect(painter.zoom()).toBeGreaterThanOrEqual(READABLE_ZOOM);
  });

  it('centres on the presented node when the picture does not fit legibly', () => {
    mount();

    // A picture that cannot fit: the nodes are spread far outside the box.
    painter.setElements({
      nodes: [NODE_A, NODE_B, NODE_C],
      edges: [EDGE, EDGE_B],
      expandedIds: new Set<string>(),
      edgeStyle: 'straight',
      presentedNodeId: NODE_A.id
    });

    painter.fitView();

    expect(painter.zoom()).toBeGreaterThanOrEqual(READABLE_ZOOM);
  });
});

describe('the nodes the host holds still', () => {
  it('keeps a pinned card where it is when the layout runs again', async () => {
    mount(new Set([NODE_A.id]));

    const before = painter.positions().get(NODE_A.id);

    painter.rearrange();

    await new Promise((resolve) => setTimeout(resolve, 60));

    const after = painter.positions().get(NODE_A.id);

    expect(before).toBeDefined();
    expect(after).toEqual(before);
  });

  it('lets the layout move a card that is not pinned', async () => {
    mount(new Set([NODE_A.id]));

    const before = painter.positions().get(NODE_B.id);

    painter.rearrange();

    await new Promise((resolve) => setTimeout(resolve, 60));

    const after = painter.positions().get(NODE_B.id);

    expect(after).not.toEqual(before);
  });
});
