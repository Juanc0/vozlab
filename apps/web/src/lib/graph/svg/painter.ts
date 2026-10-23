/**
 * The **SVG painter** of the comparison — `d3` and a hand-written picture.
 *
 * The candidate of the engine research: a painter that owns every element
 * of the graph. The card is **one `<g>`** — the rectangle, the wrapped
 * title, the meta line and the body are children of the same group — where
 * Cytoscape needs one element per ink and re-synchronises the text on every
 * frame of a drag. The relations are `<path>`s of our own, and the camera
 * is `d3-zoom`.
 *
 * The painter is **not** the whole engine of the comparison: the
 * arrangement is the app's living spring (`$lib/graph/explore/force-layout`),
 * untouched and pure, and the card's content and size come from the pure
 * modules the incumbent already uses (`card-content`, `node-card`). That is
 * exactly the point of the candidate: **the painter is separable from the
 * layout**, and the comparison changes the painter and nothing else.
 *
 * The surface is **development-only**: it lives under `lib/dev`, its
 * dependencies (`d3-selection`, `d3-zoom`, `d3-drag`) are devDependencies,
 * and no production module imports it. A production build does not carry
 * it.
 *
 * ## What the painter does
 *
 * - **one `<g>` per card**, focusable, with a visible focus ring: `Enter` or
 *   `Space` selects the node and `E` expands or collapses it;
 * - the **five shapes** of the relations as `<path>`, with the arrow, the
 *   dashes of the status and the label on an **opaque plate of the ground**;
 * - **pan, zoom (0.05–3), the fit when the view opens, the wheel and the
 *   pinch**, with the point under the pointer staying under it;
 * - **drag**: the card is pinned, its neighbours part, and on release the
 *   card keeps its place;
 * - the **living spring** of the app: idle drift, wake on contact, cool-down,
 *   no ticks in a hidden tab and a still picture under reduced motion;
 * - the **measurements** of this painter: the build of the SVG, its DOM
 *   elements, the spring's numbers and the paint's frames.
 */

import { drag, type D3DragEvent } from 'd3-drag';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom';

import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
import {
  CARD_COLOR,
  CARD_INK,
  CARD_META_INK,
  GROUND_COLOR,
  PRESENTED_COLOR,
  SELECTION_COLOR,
  edgeColor,
  nodeCardContent,
  nodeStatusBorder
} from '$lib/graph/card-content';
import {
  CARD_PADDING_Y,
  CARD_RADIUS,
  CARD_WIDTH,
  EXPANDED_CARD_WIDTH,
  META_FONT_SIZE,
  TITLE_FONT_FAMILY,
  TITLE_FONT_SIZE,
  TITLE_LINE_HEIGHT,
  createCanvasMeasurer,
  createEstimateMeasurer,
  defaultTextMeasurer,
  nodeCardSize,
  type TextMeasurer
} from '$lib/graph/node-card';
import {
  countOverlappingPairs,
  createForceLayout,
  driveForceLayout,
  runForceLayoutToRest,
  type ForceDriver,
  type ForceEdgeInput,
  type ForceLayout,
  type ForceNodeInput,
  type ForcePosition
} from '$lib/graph/explore/force-layout';
import type { EdgeStyle } from '$lib/graph/explore/edge-style';
import { observeContainerSize } from '$lib/graph/resize';
import { displayName } from '$lib/i18n/display-name';
import { DEFAULT_LOCALE } from '$lib/i18n/dictionary';
import {
  EDGE_DASH,
  EDGE_LABEL_FONT_SIZE,
  EDGE_LABEL_PLATE_PADDING,
  edgeGeometry,
  type EdgeEndpoint
} from './edge-path';
import {
  FIT_PADDING,
  ZOOM_STEP,
  clampZoom,
  fitTransform,
  toWorld,
  type CameraTransform,
  type PictureBounds,
  type ViewportSize
} from './camera';

/** The SVG namespace. */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The movement below which the picture is said to have its shape, in pixels. */
const SETTLE_MOVEMENT = 1.5;

/** How many frames the bounded watch of an arrangement waits at least. */
const WATCH_MIN_FRAMES = 8;

/** The longest the watch of an arrangement waits, in milliseconds. */
const WATCH_DEADLINE_MS = 900;

/** How often the living spring reports its state, in milliseconds. */
const REPORT_INTERVAL_MS = 500;

/** How many ticks of the spring run in one frame. */
const TICKS_PER_FRAME = 3;

/** The distance between the badge of a card and its corner, in pixels. */
const BADGE_GAP = 6;

/** The radius of the badge of a card, in pixels. */
const BADGE_RADIUS = 8;

/** How far a pointer has to travel before a press is a drag and not a click. */
const DRAG_THRESHOLD = 3;

/** The border of a card when the pointer is over it: the rule of a control. */
const HOVER_INK = '#d1d5db';

/** The visible focus ring: the accent, two pixels, outside the card. */
const FOCUS_RING = SELECTION_COLOR;

/**
 * What the painter reports when it has arranged the picture.
 *
 * It is the measurement of the **comparison**, with the two numbers that
 * are the painter's own: the time it took to build the SVG and the number
 * of DOM elements the picture is.
 */
export type SvgPainterReport = {
  /** The time the arrangement took, in milliseconds. */
  readonly ms: number;
  /** Whether the picture came to rest. */
  readonly settled: boolean;
  /** The pairs of cards that lie on top of each other. */
  readonly overlaps?: number;
  /** The pairs of edges that cross. */
  readonly edgeCrossings?: number;
  /** The steps of the simulation. */
  readonly ticks?: number;
  /** The time a frame of the arrangement took, in milliseconds. */
  readonly frameMs?: number;
  /** The time a tick of the spring took, in milliseconds. */
  readonly tickMs?: number;
  /** Whether the spring breathes instead of stopping. */
  readonly alive?: boolean;
  /** Whether the living spring is awake. */
  readonly awake?: boolean;
  /** Whether the picture has reached its shape. */
  readonly shapeReached?: boolean;
  /** The movement below which the picture is said to have its shape. */
  readonly threshold?: number;
  /** The time the SVG took to build, in milliseconds. */
  readonly buildMs: number;
  /** The elements of the SVG, the root included. */
  readonly domElements: number;
};

/** The options of the painter. */
export interface SvgPainterOptions {
  /** The element the picture is drawn in. */
  readonly container: HTMLElement;
  /** The accessible name of the picture. */
  readonly label: string;
  /** The id of the element that describes the picture. */
  readonly descriptionId?: string;
  /** The language of the interface. */
  readonly locale?: string;
  /** Called when a card is selected, or with `null` for the background. */
  readonly onselect?: (nodeId: string | null) => void;
  /** Called when a relation is selected, or with `null` for the background. */
  readonly onselectedge?: (edgeId: string | null) => void;
  /** Called when the reader walks to a node. */
  readonly onnavigate?: (nodeId: string) => void;
  /** Called when a card is expanded or collapsed. */
  readonly ontoggle?: (nodeId: string) => void;
  /** Called when the picture has been arranged. */
  readonly onlayout?: (report: SvgPainterReport) => void;
  /** Called when the picture could not be drawn. */
  readonly onerror?: (message: string) => void;
  /** Whether the cards breathe at rest. Defaults to `true`. */
  readonly idleSway?: boolean;
}

/** What the painter is given to draw. */
export interface SvgPainterElements {
  /** The nodes of the picture. */
  readonly nodes: readonly NodeDto[];
  /** The relations of the picture. */
  readonly edges: readonly SubgraphEdgeDto[];
  /** The nodes that are drawn with their whole content. */
  readonly expandedIds: ReadonlySet<string>;
  /** The shape the relations are drawn with. */
  readonly edgeStyle: EdgeStyle;
  /** The id of the selected node. */
  readonly selectedNodeId?: string | null;
  /** The id of the node the view presents. */
  readonly presentedNodeId?: string | null;
}

/** The painter of the comparison. */
export interface SvgPainter {
  /** Draws a new picture and arranges it again. */
  setElements(elements: SvgPainterElements): void;
  /** Highlights the selected node. */
  setSelected(nodeId: string | null): void;
  /** Reflects the selection of a relation. A paint, not a rebuild. */
  setSelectedEdge(edgeId: string | null): void;
  /** Marks the node the view presents. */
  setPresented(nodeId: string | null): void;
  /** Draws the relations with another shape. */
  setEdgeStyle(style: EdgeStyle): void;
  /** Wakes the living spring: a contact with the picture. */
  wake(): void;
  /** Re-runs the layout on the current picture. */
  rearrange(): void;
  /** Turns the idle sway on or off. */
  setIdleSway(value: boolean): void;
  /** Puts the whole picture in view. */
  fitView(): void;
  /** Comes closer to the picture, one step. */
  zoomIn(): void;
  /** Steps back from the picture, one step. */
  zoomOut(): void;
  /** The camera of the picture. */
  camera(): CameraTransform;
  /** The zoom of the picture. */
  zoom(): number;
  /** Where every card is, in the coordinates of the drawing. */
  positions(): Map<string, { readonly x: number; readonly y: number }>;
  /** How the picture is right now — for the tests of the living spring. */
  state(): {
    readonly alive: boolean;
    readonly awake: boolean;
    readonly ticks: number;
    readonly frames: number;
    readonly buildMs: number;
    readonly domElements: number;
    readonly movement: number;
    readonly shapeReached: boolean;
  };
  /** Destroys the picture and releases everything it holds. */
  destroy(): void;
}

/** A card of the picture, as the painter keeps it. */
interface CardView {
  readonly id: string;
  readonly datum: NodeDto;
  readonly width: number;
  readonly height: number;
  readonly group: SVGGElement;
  readonly box: SVGRectElement;
  readonly hover: SVGRectElement;
  readonly underlay: SVGRectElement;
  readonly presented: SVGRectElement;
  readonly ring: SVGRectElement;
  readonly status: { readonly width: number; readonly color: string };
}

/** A relation of the picture, as the painter keeps it. */
interface EdgeView {
  readonly id: string;
  readonly datum: SubgraphEdgeDto;
  readonly group: SVGGElement;
  readonly line: SVGPathElement;
  readonly arrow: SVGPathElement;
  readonly label: SVGGElement;
}

/**
 * Creates an SVG element with its attributes.
 *
 * @param tag - The name of the element.
 * @param attributes - The attributes to set.
 * @returns The element.
 */
function element<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Readonly<Record<string, string | number | undefined>> = {}
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);

  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined) {
      node.setAttribute(name, String(value));
    }
  }

  return node;
}

/** The middle of a list of numbers. */
function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  }

  return sorted[middle] ?? 0;
}

/** The clock of the painter. */
function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

/**
 * Whether the reader asked for less motion.
 *
 * The picture is the same one either way: with less motion the spring runs
 * to its conclusion in one go and never breathes.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Creates the SVG painter.
 *
 * The picture is built by {@link SvgPainter.setElements}: the painter is
 * created empty and the data arrives when the API answers.
 *
 * @param options - The space, the name and the callbacks.
 * @returns The painter.
 */
export function createSvgPainter(options: SvgPainterOptions): SvgPainter {
  const locale = options.locale ?? DEFAULT_LOCALE;

  // The measurers: the card is measured with the face that is drawn, and
  // the label of a relation at its own size.
  const cardMeasure: TextMeasurer = defaultTextMeasurer();
  const labelMeasure: TextMeasurer =
    createCanvasMeasurer(EDGE_LABEL_FONT_SIZE) ?? createEstimateMeasurer(EDGE_LABEL_FONT_SIZE);

  const svg = element('svg', {
    class: 'vozlab-svg-painter',
    role: 'group',
    'aria-label': options.label,
    'aria-describedby': options.descriptionId,
    'data-engine-picture': 'svg',
    width: '100%',
    height: '100%',
    style: 'display: block; touch-action: none; user-select: none;'
  }) as SVGSVGElement;

  const viewport = element('g', { class: 'vozlab-svg-viewport' });

  const edgesGroup = element('g', { class: 'vozlab-svg-edges' });
  const cardsGroup = element('g', { class: 'vozlab-svg-cards' });

  viewport.append(edgesGroup, cardsGroup);
  svg.append(viewport);
  options.container.append(svg);

  /** The cards of the picture, by the id of the node. */
  const cards = new Map<string, CardView>();

  /** The relations of the picture, by the id of the edge. */
  const edges = new Map<string, EdgeView>();

  /** The shape the relations are drawn with. */
  let edgeStyle: EdgeStyle = 'bezier';

  /** The selected node. */
  let selectedNodeId: string | null = null;
  /** The relation the inspector reads, if one is selected. */
  let selectedEdgeId: string | null = null;
  let hoveredNodeId: string | null = null;

  /** The node the view presents. */
  let presentedNodeId: string | null = null;

  /** The nodes that are drawn with their whole content. */
  let expandedIds: ReadonlySet<string> = new Set<string>();

  /** The camera of the picture. */
  let camera: CameraTransform = { x: 0, y: 0, k: 1 };

  /** Whether the view has been fitted once. */
  let fittedOnce = false;

  /** The size of the viewport, in pixels. */
  let viewportSize: ViewportSize = { width: 1, height: 1 };

  /** The time the last build of the SVG took, in milliseconds. */
  let buildMs = 0;

  /** The spring of the picture, while it is running. */
  let spring: ForceLayout | null = null;

  /** The driver of the spring. */
  let springDriver: ForceDriver | null = null;

  /** The places of the nodes that were dragged. */
  const pinned = new Map<string, ForcePosition>();

  /** The last places the spring applied. */
  let lastPlaces = new Map<string, { x: number; y: number }>();

  /** Whether the document is hidden: the spring is paused while it is. */
  let pageHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';

  /** The times the paint of a frame took, in milliseconds. */
  let frameTimes: number[] = [];

  /** The movement of the last applied frame. */
  let movement = Number.POSITIVE_INFINITY;

  /** Whether the bounded watch of this arrangement is over. */
  let watchDone = false;

  /** How many frames the watch has seen. */
  let watchFrames = 0;

  /** Whether the picture reached its shape below the threshold. */
  let shapeReached = false;

  /** The instant the watch started, in milliseconds. */
  let watchStartedAt = 0;

  /** The instant the last report went out, in milliseconds. */
  let lastReportAt = 0;

  /** Whether the pointer is dragging a card: the spring is not re-arranged. */
  let dragging = false;
  let draggingId: string | null = null;
  let renderPending = false;

  /** When a click after a drag must be ignored. */
  let suppressClickUntil = 0;

  /**
   * The frames of the animation.
   *
   * The frames of the browser while the spring is awake, and a timeout at
   * the pace of the idle breath when it rests — the same scheduler as the
   * canvas of the app.
   */
  const pendingFrames = new Map<number, () => void>();
  let nextFrameHandle = 1;

  const scheduler = {
    request(callback: () => void, delayMs?: number): number {
      const handle = nextFrameHandle;

      nextFrameHandle += 1;

      if (delayMs === undefined) {
        const frame = requestAnimationFrame(() => {
          if (pendingFrames.delete(handle)) {
            callback();
          }
        });

        pendingFrames.set(handle, () => cancelAnimationFrame(frame));

        return handle;
      }

      const timer = setTimeout(() => {
        if (pendingFrames.delete(handle)) {
          callback();
        }
      }, delayMs);

      pendingFrames.set(handle, () => clearTimeout(timer));

      return handle;
    },
    cancel(handle: number): void {
      const cancel = pendingFrames.get(handle);

      if (cancel === undefined) {
        return;
      }

      pendingFrames.delete(handle);
      cancel();
    }
  };

  /** The number of elements of the picture, the root included. */
  function domElements(): number {
    return svg.querySelectorAll('*').length + 1;
  }

  /** Stops the spring, without forgetting its places. */
  function stopSpring(): void {
    springDriver?.stop();
    springDriver = null;
    spring = null;
  }

  /** Reads the size of the space the picture is drawn in. */
  function readViewport(): ViewportSize {
    const bounds = options.container.getBoundingClientRect();

    return {
      width: Math.max(1, options.container.clientWidth || Math.round(bounds.width) || 800),
      height: Math.max(1, options.container.clientHeight || Math.round(bounds.height) || 600)
    };
  }

  /** Keeps the SVG at the size of its container. */
  function resize(): void {
    viewportSize = readViewport();

    svg.setAttribute('width', String(viewportSize.width));
    svg.setAttribute('height', String(viewportSize.height));
    svg.setAttribute('viewBox', `0 0 ${viewportSize.width} ${viewportSize.height}`);
    zoomBehavior.extent([
      [0, 0],
      [viewportSize.width, viewportSize.height]
    ]);
  }

  /** The box of the cards, in the coordinates of the drawing. */
  function pictureBounds(): PictureBounds {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const card of cards.values()) {
      const place = placeholderOf(card.id);

      minX = Math.min(minX, place.x - card.width / 2);
      minY = Math.min(minY, place.y - card.height / 2);
      maxX = Math.max(maxX, place.x + card.width / 2);
      maxY = Math.max(maxY, place.y + card.height / 2);
    }

    if (!Number.isFinite(minX)) {
      return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
    }

    return { minX, minY, maxX, maxY };
  }

  /**
   * The place a card is drawn at.
   *
   * The spring owns the place while it is running; before it has ticked,
   * it is the last place the picture knew.
   */
  function placeholderOf(id: string): { x: number; y: number } {
    const node = spring?.nodes.find((candidate) => candidate.id === id);

    if (node !== undefined) {
      return { x: node.x, y: node.y };
    }

    return lastPlaces.get(id) ?? { x: 0, y: 0 };
  }

  /** The visible box of a card, for the counter of overlaps. */
  function overlapBoxes(): { x: number; y: number; width: number; height: number }[] {
    const boxes: { x: number; y: number; width: number; height: number }[] = [];

    for (const card of cards.values()) {
      const place = placeholderOf(card.id);

      boxes.push({ x: place.x, y: place.y, width: card.width, height: card.height });
    }

    return boxes;
  }


  function segmentsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
    const cross = (ox: number, oy: number, px: number, py: number, qx: number, qy: number): number =>
      (px - ox) * (qy - oy) - (py - oy) * (qx - ox);

    const d1 = cross(cx, cy, dx, dy, ax, ay);
    const d2 = cross(cx, cy, dx, dy, bx, by);
    const d3 = cross(ax, ay, bx, by, cx, cy);
    const d4 = cross(ax, ay, bx, by, dx, dy);

    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      return true;
    }

    return false;
  }

  function countEdgeCrossings(segments: { x1: number; y1: number; x2: number; y2: number }[]): number {
    let count = 0;

    for (let i = 0; i < segments.length; i += 1) {
      for (let j = i + 1; j < segments.length; j += 1) {
        const a = segments[i];
        const b = segments[j];

        if (segmentsCross(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2)) {
          count += 1;
        }
      }
    }

    return count;
  }

  /** How many pairs of edges cross in the picture. */
  function countEdgeCrossingsFromEdges(): number {
    const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];

    for (const edge of edges.values()) {
      const source = cards.get(edge.datum.sourceNodeId);
      const target = cards.get(edge.datum.targetNodeId);

      if (source === undefined || target === undefined) {
        continue;
      }

      const sp = placeholderOf(source.id);
      const tp = placeholderOf(target.id);

      segments.push({ x1: sp.x, y1: sp.y, x2: tp.x, y2: tp.y });
    }

    return countEdgeCrossings(segments);
  }

  /** The measurement of the picture, as the comparison reads it. */
  function report(alive: boolean): void {
    const result = spring?.result();

    options.onlayout?.({
      ms: result?.ms ?? 0,
      settled: result?.settled ?? true,
      overlaps: countOverlappingPairs(overlapBoxes()),
      edgeCrossings: countEdgeCrossingsFromEdges(),
      ticks: result?.ticks ?? 0,
      frameMs: median(frameTimes),
      tickMs: result === undefined || result.ticks === 0 ? 0 : result.ms / result.ticks,
      alive,
      awake: springDriver?.awake === true,
      shapeReached: alive ? shapeReached : (result?.settled ?? true),
      threshold: SETTLE_MOVEMENT,
      buildMs,
      domElements: domElements()
    });
  }

  /** Puts a card where the spring put it. */
  function placeCard(card: CardView, place: { x: number; y: number }): void {
    card.group.setAttribute('transform', `translate(${place.x} ${place.y})`);
  }

  /** Puts every card of the picture where the spring has it. */
  function applyPlaces(): void {
    if (spring === null) {
      return;
    }

    for (const node of spring.nodes) {
      // The card the reader is dragging follows the pointer, not the
      // spring: the spring's place for it would fight the drag and make
      // the picture stutter.
      if (node.id === draggingId) {
        continue;
      }

      const card = cards.get(node.id);

      if (card !== undefined) {
        placeCard(card, { x: node.x, y: node.y });
      }
    }
  }

  /**
   * The greatest distance a card travelled since the frame before.
   *
   * It also remembers the places of this frame: the movement of the next
   * one is measured against them.
   */
  function greatestMovement(): number {
    const next = new Map<string, { x: number; y: number }>();
    let greatest = 0;

    for (const card of cards.values()) {
      const place = placeholderOf(card.id);

      next.set(card.id, place);

      const last = lastPlaces.get(card.id);

      if (last === undefined) {
        continue;
      }

      greatest = Math.max(greatest, Math.hypot(place.x - last.x, place.y - last.y));
    }

    lastPlaces = next;

    return greatest;
  }

  /** Draws every relation of the picture. */
  function renderEdges(): void {
    for (const edge of edges.values()) {
      const source = cards.get(edge.datum.sourceNodeId);
      const target = cards.get(edge.datum.targetNodeId);

      if (source === undefined || target === undefined) {
        continue;
      }

      const sourcePlace = placeholderOf(source.id);
      const targetPlace = placeholderOf(target.id);

      const sourceEndpoint: EdgeEndpoint = {
        x: sourcePlace.x,
        y: sourcePlace.y,
        width: source.width,
        height: source.height
      };
      const targetEndpoint: EdgeEndpoint = {
        x: targetPlace.x,
        y: targetPlace.y,
        width: target.width,
        height: target.height
      };

      const geometry = edgeGeometry(edgeStyle, sourceEndpoint, targetEndpoint);

      edge.line.setAttribute('d', geometry.path);
      edge.arrow.setAttribute('d', geometry.arrow);
      edge.label.setAttribute(
        'transform',
        `translate(${geometry.label.x} ${geometry.label.y}) rotate(${
          (geometry.label.angle * 180) / Math.PI
        })`
      );
    }
  }

  /**
   * Creates the group of a card, with its whole content inside.
   *
   * The group is the card: the rectangle, the title's lines, the meta line,
   * the body, the selection, the ring of the view and the badge of the
   * expansion are **children of the same `<g>`**. That is the thing the
   * candidate brings, and the reason the text is not re-synchronised.
   */
  function createCard(node: NodeDto): CardView {
    const expanded = expandedIds.has(node.id);
    const content = nodeCardContent(node, { locale, expanded });
    const size = nodeCardSize(content.title, {
      measure: cardMeasure,
      width: expanded ? EXPANDED_CARD_WIDTH : CARD_WIDTH,
      meta: content.meta,
      body: expanded ? content.body : ''
    });
    const status = nodeStatusBorder(node.status);
    const halfWidth = size.width / 2;
    const halfHeight = size.height / 2;
    const selected = node.id === selectedNodeId;

    const group = element('g', {
      class: 'vozlab-svg-card',
      'data-node-id': node.id,
      'data-expanded': String(expanded),
      tabindex: '0',
      focusable: 'true',
      role: 'button',
      'aria-label': `${node.title} — ${content.meta}`,
      'aria-pressed': selected ? 'true' : 'false',
      'aria-expanded': String(expanded)
    });

    // The halo of the selection is **behind** the card: an element painted
    // above it would tint the card and its text.
    const underlay = element('rect', {
      class: 'vozlab-svg-underlay',
      x: -halfWidth - 6,
      y: -halfHeight - 6,
      width: size.width + 12,
      height: size.height + 12,
      rx: CARD_RADIUS + 6,
      fill: SELECTION_COLOR,
      'fill-opacity': 0.12,
      opacity: selected ? 1 : 0
    });

    // The status is a **border**, never a fill: a card painted in a
    // saturated colour is a wall of colour, not a picture of a graph.
    const box = element('rect', {
      class: 'vozlab-svg-card-box',
      x: -halfWidth,
      y: -halfHeight,
      width: size.width,
      height: size.height,
      rx: CARD_RADIUS,
      fill: CARD_COLOR,
      stroke: selected ? SELECTION_COLOR : status.width === 0 ? 'none' : status.color,
      'stroke-width': selected ? 3 : status.width === 0 ? undefined : status.width
    });

    // The hover mark is a rule of the control, and it is only there when
    // the pointer is over the card.
    const hover = element('rect', {
      class: 'vozlab-svg-hover',
      x: -halfWidth - 2,
      y: -halfHeight - 2,
      width: size.width + 4,
      height: size.height + 4,
      rx: CARD_RADIUS + 2,
      fill: 'none',
      stroke: HOVER_INK,
      'stroke-width': 1,
      opacity: 0
    });

    const presented = element('rect', {
      class: 'vozlab-svg-presented',
      x: -halfWidth - 3.5,
      y: -halfHeight - 3.5,
      width: size.width + 7,
      height: size.height + 7,
      rx: CARD_RADIUS + 3.5,
      fill: 'none',
      stroke: PRESENTED_COLOR,
      'stroke-width': 3,
      opacity: node.id === presentedNodeId ? 1 : 0
    });

    const ring = element('rect', {
      class: 'vozlab-svg-ring',
      x: -halfWidth - 5,
      y: -halfHeight - 5,
      width: size.width + 10,
      height: size.height + 10,
      rx: CARD_RADIUS + 5,
      fill: 'none',
      stroke: FOCUS_RING,
      'stroke-width': 2,
      opacity: 0
    });

    const title = element('text', {
      class: 'vozlab-svg-title',
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      'font-family': TITLE_FONT_FAMILY,
      'font-size': TITLE_FONT_SIZE,
      fill: CARD_INK
    });

    size.lines.forEach((line, index) => {
      const y = -halfHeight + CARD_PADDING_Y + TITLE_LINE_HEIGHT / 2 + index * TITLE_LINE_HEIGHT;
      const tspan = element('tspan', { x: 0, y });

      tspan.textContent = line;
      title.append(tspan);
    });

    const meta = element('text', {
      class: 'vozlab-svg-meta',
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      'font-family': TITLE_FONT_FAMILY,
      'font-size': META_FONT_SIZE,
      fill: CARD_META_INK,
      x: 0,
      y: size.metaY
    });

    meta.textContent = content.meta;

    group.append(underlay, box, presented, hover);

    if (content.meta !== '') {
      group.append(meta);
    }

    if (expanded && size.body !== '') {
      const body = element('text', {
        class: 'vozlab-svg-body',
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': TITLE_FONT_FAMILY,
        'font-size': TITLE_FONT_SIZE,
        fill: CARD_INK
      });

      const lines = size.body.split('\n');
      const first = size.bodyY - size.bodyHeight / 2 + TITLE_LINE_HEIGHT / 2;

      lines.forEach((line, index) => {
        const tspan = element('tspan', { x: 0, y: first + index * TITLE_LINE_HEIGHT });

        tspan.textContent = line;
        body.append(tspan);
      });

      group.append(body);
    }

    group.append(title, ring);

    // The badge of the expansion: the control of the card, outside its
    // corner so it does not cover the title. It is a child of the card, so
    // it moves with it and it is part of the same `<g>`.
    const badge = element('g', {
      class: 'vozlab-svg-badge',
      transform: `translate(${halfWidth - BADGE_GAP - BADGE_RADIUS} ${
        -halfHeight + BADGE_GAP + BADGE_RADIUS
      })`,
      'aria-hidden': 'true'
    });

    const badgeSign = element('text', {
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': TITLE_FONT_FAMILY,
      'font-size': 10,
      'font-weight': 600,
      fill: CARD_INK
    });

    badgeSign.textContent = expanded ? '−' : '+';

    badge.append(
      element('circle', {
        r: BADGE_RADIUS,
        fill: CARD_COLOR,
        stroke: HOVER_INK,
        'stroke-width': 1
      }),
      badgeSign
    );

    group.append(badge);

    badge.addEventListener('click', (event) => {
      event.stopPropagation();
      options.ontoggle?.(node.id);
    });

    // A double click on the badge has already toggled twice; the dblclick
    // of the card must not toggle a third time.
    badge.addEventListener('dblclick', (event) => {
      event.stopPropagation();
    });

    group.addEventListener('click', (event) => {
      if (Date.now() < suppressClickUntil) {
        return;
      }

      event.stopPropagation();
      options.onselect?.(node.id);
    });

    group.addEventListener('dblclick', (event) => {
      if (Date.now() < suppressClickUntil) {
        return;
      }

      event.stopPropagation();
      event.preventDefault();
      options.ontoggle?.(node.id);
    });

    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        options.onselect?.(node.id);
        return;
      }

      if (event.key === 'e' || event.key === 'E' || event.key === '+' || event.key === '-') {
        event.preventDefault();
        options.ontoggle?.(node.id);
      }
    });

    group.addEventListener('mouseenter', () => {
      group.setAttribute('data-hovered', 'true');
      hover.setAttribute('opacity', '1');

      const place = placeholderOf(node.id);

      spring?.pin(node.id, place);
      lastPlaces.set(node.id, place);

      hoveredNodeId = node.id;
    });

    group.addEventListener('mouseleave', () => {
      group.removeAttribute('data-hovered');
      hover.setAttribute('opacity', '0');

      // The card moves again, unless it is still selected.
      if (hoveredNodeId === node.id && selectedNodeId !== node.id) {
        spring?.unpin(node.id);
      }

      if (hoveredNodeId === node.id) {
        hoveredNodeId = null;
      }
    });

    // The focus ring is the mark of the control: it is shown while the
    // card has the focus, and it is the accent the rest of the interface
    // uses for a focused control.
    group.addEventListener('focus', () => {
      ring.setAttribute('opacity', '1');
    });

    group.addEventListener('blur', () => {
      ring.setAttribute('opacity', '0');
    });

    return {
      id: node.id,
      datum: node,
      width: size.width,
      height: size.height,
      group,
      box,
      hover,
      underlay,
      presented,
      ring,
      status
    };
  }

  /** Creates the group of a relation, with its line, its arrow and its plate. */
  function createEdge(edge: SubgraphEdgeDto): EdgeView {
    const color = edgeColor(edge.status);
    const label = displayName(edge.relationDisplayNames, locale, edge.relationKey);
    const plateWidth = Math.max(1, Math.ceil(labelMeasure(label))) + EDGE_LABEL_PLATE_PADDING * 2;
    const plateHeight = EDGE_LABEL_FONT_SIZE + EDGE_LABEL_PLATE_PADDING * 2;

    const group = element('g', {
      class: 'vozlab-svg-edge',
      'data-edge-id': edge.id
    });

    const line = element('path', {
      class: 'vozlab-svg-edge-line',
      fill: 'none',
      stroke: color,
      'stroke-width': 1.5,
      'stroke-dasharray': EDGE_DASH[edge.status],
      'stroke-linecap': 'butt'
    });

    const arrow = element('path', {
      class: 'vozlab-svg-arrow',
      fill: color,
      stroke: 'none'
    });

    const labelGroup = element('g', { class: 'vozlab-svg-edge-label' });

    // The plate is **opaque** and it is the ground of the canvas: the line
    // of the relation must not show through the name that names it.
    const plate = element('rect', {
      class: 'vozlab-svg-edge-plate',
      x: -plateWidth / 2,
      y: -plateHeight / 2,
      width: plateWidth,
      height: plateHeight,
      rx: 2,
      fill: GROUND_COLOR,
      'fill-opacity': 1
    });

    const text = element('text', {
      class: 'vozlab-svg-edge-label-text',
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      'font-family': TITLE_FONT_FAMILY,
      'font-size': EDGE_LABEL_FONT_SIZE,
      fill: CARD_META_INK,
      x: 0,
      y: 0
    });

    text.textContent = label;

    labelGroup.append(plate, text);
    group.append(line, arrow, labelGroup);

    // A relation answers the pointer the way a card does: one click (or a
    // double click — there is no expanded card to grow into) selects it,
    // and the inspector reads it whole. The plate widens the target: a
    // line one pixel and a half wide is a target nobody can hit.
    const selectThis = (event: Event): void => {
      if (Date.now() < suppressClickUntil) {
        return;
      }

      event.stopPropagation();
      event.preventDefault();
      options.onselectedge?.(edge.id);
    };

    group.addEventListener('click', selectThis);
    group.addEventListener('dblclick', selectThis);

    return {
      id: edge.id,
      datum: edge,
      group,
      line,
      arrow,
      label: labelGroup
    };
  }

  /** Empties the cards of the picture. */
  function clearCards(): void {
    cards.clear();
    cardsGroup.replaceChildren();
  }

  /** Empties the relations of the picture. */
  function clearEdges(): void {
    edges.clear();
    edgesGroup.replaceChildren();
  }

  /**
   * Builds the picture: the relations first, then the cards.
   *
   * The order is the order of the paint: a relation runs **under** the
   * card, and the card is what the reader reads.
   */
  function build(elements: SvgPainterElements): void {
    const began = now();

    // The places the picture already knew survive a rebuild: an expanded
    // card must not throw the whole graph back to the seed circle.
    const previous = new Map<string, { x: number; y: number }>(lastPlaces);

    if (spring !== null) {
      for (const node of spring.nodes) {
        previous.set(node.id, { x: node.x, y: node.y });
      }
    }

    expandedIds = elements.expandedIds;
    edgeStyle = elements.edgeStyle;
    selectedNodeId = elements.selectedNodeId ?? null;
    presentedNodeId = elements.presentedNodeId ?? null;

    stopSpring();
    clearCards();
    clearEdges();

    for (const edge of elements.edges) {
      const view = createEdge(edge);

      edges.set(edge.id, view);
      edgesGroup.append(view.group);
    }

    for (const node of elements.nodes) {
      const view = createCard(node);

      cards.set(node.id, view);
      cardsGroup.append(view.group);
    }

    buildMs = now() - began;

    spring = createForceLayout(
      elements.nodes.map((node): ForceNodeInput => {
        const place = previous.get(node.id);

        return {
          id: node.id,
          width: cards.get(node.id)?.width ?? CARD_WIDTH,
          height: cards.get(node.id)?.height ?? 60,
          ...(place === undefined ? {} : { x: place.x, y: place.y })
        };
      }),
      elements.edges.map(
        (edge): ForceEdgeInput => ({
          source: edge.sourceNodeId,
          target: edge.targetNodeId,
          communityScore: edge.communityScore
        })
      ),
      // The painter's arrangement is the app's living spring: it drifts for
      // as long as the panel is on screen and stops only when the tab or the
      // panel is hidden. The reader who asked for less motion gets the
      // one-pass arrangement, which has to be able to rest.
      { pinned, living: !prefersReducedMotion(), idleSway: options.idleSway !== false }
    );

    applyPlaces();
    renderEdges();

    if (!fittedOnce) {
      fitView();
      fittedOnce = true;
    }

    frameTimes = [];
    movement = Number.POSITIVE_INFINITY;
    watchDone = false;
    watchFrames = 0;
    shapeReached = false;
    watchStartedAt = Date.now();
    lastReportAt = watchStartedAt;

    startSpring();
  }

  /** Starts the spring of the picture, in slices or in one go. */
  function startSpring(): void {
    if (spring === null) {
      return;
    }

    if (cards.size === 0) {
      // There is nothing to breathe: the empty picture is settled, and no
      // driver is left running for a window that is not there.
      springDriver = null;
      shapeReached = true;
      report(false);
      return;
    }

    const layout = spring;

    if (prefersReducedMotion()) {
      // Less motion: the picture is arranged in one go and it does not
      // breathe. It is the same picture the animated path arrives at.
      const result = runForceLayoutToRest(layout);

      spring = layout;
      applyPlaces();
      renderEdges();
      shapeReached = result.settled;
      movement = result.settled ? 0 : Number.POSITIVE_INFINITY;

      options.onlayout?.({
        ms: result.ms,
        settled: result.settled,
        overlaps: result.overlaps,
        ticks: result.ticks,
        frameMs: 0,
        tickMs: result.ticks === 0 ? 0 : result.ms / result.ticks,
        alive: false,
        awake: false,
        shapeReached,
        threshold: SETTLE_MOVEMENT,
        buildMs,
        domElements: domElements()
      });

      springDriver = null;
      return;
    }

    springDriver = driveForceLayout(layout, {
      scheduler,
      ticksPerFrame: TICKS_PER_FRAME,
      living: true,
      onFrame: () => {
        const began = now();

        applyPlaces();
        renderEdges();

        frameTimes.push(now() - began);
        watchFrames += 1;
        movement = greatestMovement();

        const at = Date.now();
        const quiet = watchFrames >= WATCH_MIN_FRAMES && movement < SETTLE_MOVEMENT;
        const late = at - watchStartedAt >= WATCH_DEADLINE_MS;

        if (!watchDone) {
          if (!quiet && !late) {
            return;
          }

          watchDone = true;
          shapeReached = movement < SETTLE_MOVEMENT;
          report(true);
          lastReportAt = at;

          return;
        }

        if (at - lastReportAt >= REPORT_INTERVAL_MS) {
          report(true);
          lastReportAt = at;
        }
      }
    });

    if (!pageHidden) {
      springDriver.start();
    }
  }

  /** Pauses the spring while the tab is hidden, and resumes it after. */
  function onVisibilityChange(): void {
    pageHidden = document.visibilityState === 'hidden';

    if (pageHidden) {
      springDriver?.stop();
      return;
    }

    if (spring !== null && springDriver !== null) {
      springDriver.start();
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  /** Wakes the living spring: a contact with the picture. */
  function wake(): void {
    if (pageHidden || dragging) {
      return;
    }

    springDriver?.wake();
  }

  const zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> = zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.05, 3])
    .extent([
      [0, 0],
      [1, 1]
    ])
    .filter((event: Event) => {
      // A pan starts on the background: a press on a card is a drag of the
      // card, and d3-drag has already stopped the event.
      if (event.type === 'mousedown' || event.type === 'touchstart') {
        return !(event.target instanceof Element) || event.target.closest('.vozlab-svg-card') === null;
      }

      return !event.defaultPrevented;
    })
    .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
      camera = { x: event.transform.x, y: event.transform.y, k: event.transform.k };
      viewport.setAttribute('transform', String(event.transform));
    });

  select(svg).call(zoomBehavior).on('dblclick.zoom', null);

  function zoomIn(): void {
    zoomBehavior.scaleBy(select(svg), ZOOM_STEP);
  }

  function zoomOut(): void {
    zoomBehavior.scaleBy(select(svg), 1 / ZOOM_STEP);
  }

  /** The fit: the whole picture in view, once. */
  function fitView(): void {
    const transform = fitTransform(pictureBounds(), viewportSize, FIT_PADDING);

    camera = transform;

    select(svg).call(
      zoomBehavior.transform,
      zoomIdentity.translate(transform.x, transform.y).scale(transform.k)
    );
  }

  // The pointer moves over the picture: the spring wakes, even when it is
  // not over a card. The idle breath is for a picture nobody is touching.
  // The picture is not woken by the pointer: it breathes on its own at the
  // idle pace, and only the tab visibility changes its rhythm.

  // The background is the way to clear the selection.
  svg.addEventListener('click', (event) => {
    if (event.target === svg || event.target === viewport) {
      options.onselect?.(null);
    }
  });

  let dragOffset = { x: 0, y: 0 };
  let dragMoved = false;

  const dragBehavior = drag<SVGGElement, CardView>()
    .container(() => svg)
    .filter((event: Event) => {
      if (event.target instanceof Element && event.target.closest('.vozlab-svg-badge') !== null) {
        return false;
      }

      if (event instanceof MouseEvent) {
        return event.button === 0 && !event.ctrlKey;
      }

      return true;
    })
    .on('start', (event: D3DragEvent<SVGGElement, CardView, CardView>) => {
      const node = event.subject;
      const world = toWorld(camera, { x: event.x, y: event.y });
      const place = placeholderOf(node.id);

      dragging = true;
      draggingId = node.id;
      dragOffset = { x: world.x - place.x, y: world.y - place.y };
      dragMoved = false;

      // The card is pinned where it is: the spring works around it.
      spring?.pin(node.id, place);
    })
    .on('drag', (event: D3DragEvent<SVGGElement, CardView, CardView>) => {
      const node = event.subject;
      const world = toWorld(camera, { x: event.x, y: event.y });
      const place = {
        x: world.x + dragOffset.x,
        y: world.y + dragOffset.y
      };

      if (Math.hypot(event.dx, event.dy) >= DRAG_THRESHOLD) {
        dragMoved = true;
      }

      // The card follows the pointer, and the spring is told where it is:
      // the collision takes the pinned card as an obstacle and the links
      // pull the neighbours, so the cards around it part.
      spring?.pin(node.id, place);
      lastPlaces.set(node.id, place);
      placeCard(node, place);

      if (!renderPending) {
        renderPending = true;

        requestAnimationFrame(() => {
          renderEdges();
          renderPending = false;
        });
      }

    })
    .on('end', (event: D3DragEvent<SVGGElement, CardView, CardView>) => {
      const node = event.subject;
      const world = toWorld(camera, { x: event.x, y: event.y });
      const place = { x: world.x + dragOffset.x, y: world.y + dragOffset.y };

      // The card is released: the spring takes it back and it moves with
      // the rest of the picture. It is not pinned for the rest of the view.
      spring?.unpin(node.id);
      lastPlaces.set(node.id, place);
      placeCard(node, place);

      if (!renderPending) {
        renderPending = true;

        requestAnimationFrame(() => {
          renderEdges();
          renderPending = false;
        });
      }

      if (dragMoved) {
        suppressClickUntil = Date.now() + 150;
      }

      draggingId = null;
      dragging = false;
    });

  /**
   * Binds the drag to the card.
   *
   * The bind happens after the card is built: a card that is created after
   * the painter has been created has to be draggable too.
   */
  function bindDrag(view: CardView): void {
    select(view.group).datum(view).call(dragBehavior);
  }

  /** Updates the highlight of the selected relation, next to the cards'. */
  function paintEdgeSelection(): void {
    for (const view of edges.values()) {
      const selected = view.id === selectedEdgeId;

      view.line.setAttribute('stroke-width', selected ? '3.5' : '1.5');
      view.group.setAttribute('data-selected', selected ? 'true' : 'false');
    }
  }

  /** Updates the selection ring of the cards. */
  function paintSelection(): void {
    for (const card of cards.values()) {
      const selected = card.id === selectedNodeId;

      card.group.setAttribute('aria-pressed', selected ? 'true' : 'false');
      card.box.setAttribute(
        'stroke',
        selected ? SELECTION_COLOR : card.status.width === 0 ? 'none' : card.status.color
      );
      if (selected) {
        card.box.setAttribute('stroke-width', '3');
      } else if (card.status.width === 0) {
        card.box.removeAttribute('stroke-width');
      } else {
        card.box.setAttribute('stroke-width', String(card.status.width));
      }
      card.underlay.setAttribute('opacity', selected ? '1' : '0');
    }
  }

  /** Updates the ring of the node the view presents. */
  function paintPresented(): void {
    for (const card of cards.values()) {
      card.presented.setAttribute('opacity', card.id === presentedNodeId ? '1' : '0');
    }
  }

  let lastElements: SvgPainterElements | null = null;

  function doRearrange(): void {
    if (lastElements === null) {
      return;
    }

    const els = lastElements;

    const runShake = (shake: number): void => {
      if (shake >= 8) {
        report(springDriver !== null);
        return;
      }

      lastPlaces = new Map();

      build(els);

      for (const card of cards.values()) {
        bindDrag(card);
      }

      paintSelection();
      paintPresented();

      if (spring !== null) {
        runForceLayoutToRest(spring);
        applyPlaces();
        renderEdges();
      }

      if (countEdgeCrossingsFromEdges() === 0) {
        report(springDriver !== null);
        return;
      }

      setTimeout(() => runShake(shake + 1), 16);
    };

    runShake(0);
  }

  function setElements(elements: SvgPainterElements): void {
    lastElements = elements;
    build(elements);

    for (const card of cards.values()) {
      bindDrag(card);
    }

    paintSelection();
    paintPresented();
    paintEdgeSelection();

  }

  const stopObserving = observeContainerSize(options.container, () => {
    resize();
  });

  resize();

  return {
    setElements,
    setSelected(nodeId: string | null): void {
      // The previously selected card moves again, unless it is hovered.
      if (selectedNodeId !== null && selectedNodeId !== nodeId && hoveredNodeId !== selectedNodeId) {
        spring?.unpin(selectedNodeId);
      }

      // One thing is selected: choosing a card lets the highlight of the
      // relation go.
      selectedEdgeId = null;
      paintEdgeSelection();

      selectedNodeId = nodeId;
      paintSelection();

      if (nodeId !== null && hoveredNodeId !== nodeId) {
        const card = cards.get(nodeId);

        if (card !== undefined) {
          const place = placeholderOf(nodeId);

          spring?.pin(nodeId, place);
        }
      }
    },
    setPresented(nodeId: string | null): void {
      presentedNodeId = nodeId;
      paintPresented();
    },
    setSelectedEdge(edgeId: string | null): void {
      // One thing is selected: choosing a relation lets the ring of a
      // card go, and the other way round.
      selectedNodeId = null;
      paintSelection();
      selectedEdgeId = edgeId;
      paintEdgeSelection();
    },
    setEdgeStyle(style: EdgeStyle): void {
      edgeStyle = style;
      renderEdges();
    },
    wake,
    rearrange() {
      if (lastElements === null) {
        return;
      }

      const els = lastElements;

      if (els === null) {
        return;
      }

      const runShake = (shake: number): void => {
        if (shake >= 8) {
          report(springDriver !== null);
          return;
        }

        // Clear the remembered places so each shake re-seeds from the
        // circle: the graph explodes and reorganises from scratch.
        lastPlaces = new Map();

        build(els);

        for (const card of cards.values()) {
          bindDrag(card);
        }

        paintSelection();
        paintPresented();

        if (spring !== null) {
          runForceLayoutToRest(spring);
          applyPlaces();
          renderEdges();
        }

        if (countEdgeCrossingsFromEdges() === 0) {
          report(springDriver !== null);
          return;
        }

        setTimeout(() => runShake(shake + 1), 16);
      };

      runShake(0);
    },
    setIdleSway: (value: boolean) => {
      spring?.setIdleSway(value);
    },
    fitView,
    zoomIn,
    zoomOut,
    camera(): CameraTransform {
      return { ...camera };
    },
    zoom(): number {
      return clampZoom(camera.k);
    },
    positions(): Map<string, { x: number; y: number }> {
      const places = new Map<string, { x: number; y: number }>();

      for (const card of cards.values()) {
        places.set(card.id, placeholderOf(card.id));
      }

      return places;
    },
    state() {
      return {
        alive: springDriver !== null,
        awake: springDriver?.awake === true,
        ticks: spring?.ticks ?? 0,
        frames: springDriver?.frames ?? 0,
        buildMs,
        domElements: domElements(),
        movement,
        shapeReached
      };
    },
    destroy(): void {
      stopSpring();
      stopObserving();

      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }

      for (const handle of [...pendingFrames.keys()]) {
        scheduler.cancel(handle);
      }

      select(svg).on('.zoom', null);
      select(svg).on('.drag', null);
      svg.remove();
    }
  };
}
