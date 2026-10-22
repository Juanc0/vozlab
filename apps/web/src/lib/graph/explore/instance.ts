/**
 * The Cytoscape instance of the **exploration view**.
 *
 * It is a second canvas, next to the one of the subgraph: the instance is
 * created once and its elements are patched afterwards, exactly like the
 * subgraph's. What it adds over the subgraph is the interaction:
 *
 * - the node that is **presented** (the focus) wears a ring of its own;
 * - a node can be **expanded** — its card grows and shows the description
 *   and the attributes of the node — and the layout is run again so the
 *   picture rearranges around the new space;
 * - a node can be **dragged** to another place among the others, and the
 *   place it was put survives the next layout;
 * - the relations are drawn with the shape the user chose; no shape is
 *   routed, so every one of them is a curve and nothing more;
 * - the pointer over a node or a relation opens a **preview** of it.
 *
 * The instance also **follows the size of its container**: a
 * `ResizeObserver` redraws the picture when the window is resized, and the
 * viewport is left where the user put it.
 *
 * The module is imported **dynamically**, from the browser only: Cytoscape
 * draws to a `<canvas>`, so the server pass must never evaluate it.
 */

import type { Collection, Core, Position } from 'cytoscape';
import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
import {
  cardIdOf,
  cardLayoutOptions,
  cardNodes,
  prepareCardText,
  relationCardNodes,
  relationIdOf,
  syncCardText,
  toGraphElements
} from '../elements';
import { observeContainerSize } from '../resize';
import { cytoscape } from '../cytoscape-runtime';
import { edgeStyleProperties, type EdgeStyle } from './edge-style';
import {
  explorationLayoutOptions,
  pinTransform,
  seedCirclePositions,
  type GraphLayout
} from './layout';
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
} from './force-layout';
import {
  createDagLayout,
  relationsAgainstFlow,
  type DagEdgeInput,
  type DagNodeInput
} from './dag-layout';
import { relationCardPlacement, type CardBox } from '../relation-card';
import { EXPLORE_STYLESHEET, PRESENTED_CLASS, SELECTED_CLASS } from './stylesheet';
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, clampZoom, type ZoomSource } from './zoom';

/** What the pointer is over. */
export interface ExplorationPreview {
  /** Whether the pointer is over a node or over a relation. */
  readonly kind: 'node' | 'edge';
  /** The id of the node or of the relation. */
  readonly id: string;
  /** Where the pointer is, in the rendered coordinates of the canvas. */
  readonly x: number;
  /** Where the pointer is, in the rendered coordinates of the canvas. */
  readonly y: number;
}

/**
 * What a layout that ran tells about itself.
 *
 * The report is **additive**: the graph of the app does not ask for it, and
 * the development surface that compares the engines is the only thing that
 * reads it.
 */
export interface LayoutReport {
  /** The layout that ran. */
  readonly layout: GraphLayout;
  /** The instant the layout took, in milliseconds. */
  readonly ms: number;
  /** Whether the picture stopped moving. */
  readonly settled: boolean;
  /** The greatest movement of the last step, in pixels. */
  readonly movement: number;
  /**
   * The number of pairs of cards that overlap.
   *
   * It is the metric that told the truth about `fcose`: a layout that
   * settles in half a second can still leave hundreds of pairs of cards
   * on top of each other.
   */
  readonly overlaps: number;
  /**
   * How many ticks of the simulation ran.
   *
   * It is there for the **spring**: the simulation of `d3-force` is run in
   * slices, and the number of the ticks says how many slices there were.
   */
  readonly ticks?: number;
  /**
   * The time a frame of the layout took, in milliseconds.
   *
   * It is the **median** of the frames: the work of the picture (putting
   * the cards in their places) and not the wait for the browser.
   */
  readonly frameMs?: number;
  /**
   * The relations whose arrow is drawn **against** the flow of the picture.
   *
   * A layered arrangement has to break the cycles of the relation graph to
   * be able to order the nodes, and the relations it breaks are drawn
   * against what they say. `dagre` breaks them **silently**; this report
   * is how the surface of the comparison tells the reader how many of them
   * there were.
   */
  readonly reversedRelations?: readonly string[];
}

/** What the exploration instance reports. */
export interface ExplorationInstanceOptions {
  /** The DOM element the canvas is drawn in. */
  container: HTMLElement;
  /** Called with the id of the tapped node, or `null` for the background. */
  onselect: (nodeId: string | null) => void;
  /**
   * Called with the id of the tapped node when the user **walks** to it.
   *
   * A tap on a node is two things at once: it selects the node (the
   * inspector shows it) and it walks to it (the view asks the API for the
   * subgraph rooted at that node). They are told apart here so the app can
   * answer the two with two different things.
   */
  onnavigate?: (nodeId: string) => void;
  /** Called with the id of the relation whose card was tapped. */
  onselectedge: (edgeId: string) => void;
  /** Called with what the pointer is over, or `null` when it leaves. */
  onpreview: (preview: ExplorationPreview | null, related: EventTarget | null) => void;
  /** Called when the user drops a node in another place. */
  ondrag: (nodeId: string, position: Position) => void;
  /** Called when the picture changed and the badges have to be moved. */
  onrender: () => void;
  /**
   * Called when a layout has run and the picture has come to rest.
   *
   * The graph of the app does not ask for the report: the development
   * surface that compares the engines is the only reader.
   */
  onlayout?: (report: LayoutReport) => void;
  /**
   * The zoom the reader had when the view was opened.
   *
   * It is `null` when the reader never chose one: the picture is then
   * **fitted** — the whole graph in view — and the fit is the zoom that
   * picture starts with.
   *
   * The value is read **once**, when the instance is created: the zoom
   * belongs to the reader, and a new window must not impose it again.
   */
  zoom?: number | null;
  /**
   * Called when the zoom of the picture changes.
   *
   * The app keeps the value: the zoom survives the change of the view of
   * the graph — the two views are the same workspace — and it is the
   * reader's, not the picture's.
   *
   * The **source** says who changed it: the reader (the wheel, the pinch,
   * the controls) or the view (the fit of the picture).
   */
  onzoom?: (zoom: number, source: ZoomSource) => void;
}

/** How the elements of the exploration view are drawn. */
export interface ExplorationElementsOptions {
  /** The nodes that are drawn as a card. */
  expandedIds: ReadonlySet<string>;
  /** The relations that are drawn as a card with their whole content. */
  expandedEdgeIds: ReadonlySet<string>;
  /** The shape the relations are drawn with. */
  edgeStyle: EdgeStyle;
  /** The node the view presents. */
  presentedNodeId: string | null;
  /** The places the user put the dragged nodes in. */
  pinned: ReadonlyMap<string, Position>;
  /**
   * The layout the picture is arranged with.
   *
   * The default is `d3`: the **spring** of the app, a simulation of
   * `d3-force` with a rectangular collision force. The deterministic
   * `dagre` and the `fcose` of the extension are there for the comparison
   * of the engines.
   */
  layout?: GraphLayout;
  /**
   * The smallest zoom the picture is fitted to.
   *
   * It is the **floor of the fit**, and it is asked for by the callers that
   * need it: the comparison of the engines draws three pictures at once and
   * asks for a smaller one, so that the three pictures can be seen whole.
   *
   * The app asks for **nothing**: the fit of the picture is the fit, and
   * the reader decides afterwards whether to come closer to read the
   * titles.
   */
  readableZoom?: number;
  /**
   * The language of the interface.
   *
   * The name of the class of a node, the name of the relation of an edge
   * and the status of a node are read in it.
   */
  locale?: string;
}

/** A node as the picture shows it: where it is and how big it is. */
export interface RenderedBox {
  /** The centre of the node, in the rendered coordinates of the canvas. */
  readonly x: number;
  /** The centre of the node, in the rendered coordinates of the canvas. */
  readonly y: number;
  /** The width of the node, in rendered pixels. */
  readonly width: number;
  /** The height of the node, in rendered pixels. */
  readonly height: number;
}

/**
 * A relation as the picture shows it: where its line is and which way it
 * goes.
 *
 * The badge of a relation is on its line, so the view needs the **middle**
 * of the line and the **perpendicular** of it: the badge is placed beside
 * the line and not on it.
 */
export interface RenderedRelation {
  /** The middle of the line, in the rendered coordinates of the canvas. */
  readonly x: number;
  /** The middle of the line, in the rendered coordinates of the canvas. */
  readonly y: number;
  /** The unit vector perpendicular to the line, on the x axis. */
  readonly nx: number;
  /** The unit vector perpendicular to the line, on the y axis. */
  readonly ny: number;
}

/** The exploration instance. */
export interface ExplorationInstance {
  /** Replaces the elements of the graph, runs the layout again. */
  setElements(
    nodes: readonly NodeDto[],
    edges: readonly SubgraphEdgeDto[],
    options: ExplorationElementsOptions
  ): void;
  /** Highlights the selected node (and clears the previous highlight). */
  setSelected(nodeId: string | null): void;
  /** Marks the node the view presents. */
  setPresented(nodeId: string | null): void;
  /** Draws the relations with another shape. */
  setEdgeStyle(style: EdgeStyle): void;
  /** Draws the relations again — after a drag, for instance. */
  /** Draws the relations again, with the shape that is selected. */
  refreshEdgeStyles(): void;
  /** Where every node is, in the rendered coordinates of the canvas. */
  positions(): Map<string, RenderedBox>;
  /** Where the line of every relation is, in the rendered coordinates. */
  relationPositions(): Map<string, RenderedRelation>;
  /** Where the card of every expanded relation is, in the rendered coordinates. */
  relationCards(): Map<string, RenderedBox>;
  /**
   * The zoom of the picture, in the range of the reader.
   *
   * It is the zoom the reader has: the fit when they never chose one.
   */
  zoom(): number;
  /** Comes closer to the picture, one step. */
  zoomIn(): void;
  /** Goes away from the picture, one step. */
  zoomOut(): void;
  /**
   * Puts the whole picture in view.
   *
   * It is the **fit**, and it is the reader who asks for it: the button of
   * the toolbar is a choice, not something the view does on its own.
   */
  fitView(): void;
  /** Destroys the instance and releases the canvas. */
  destroy(): void;
}

/**
 * How long the pan of a walk takes, in milliseconds.
 *
 * It is a third of a second: long enough to be seen as a **movement** and
 * short enough not to be waited for. A jump is not a movement, and a
 * movement that takes a second is a broken picture.
 */
const PAN_DURATION = 320;

/**
 * The shape of the pan of a walk.
 *
 * It is eased in and out: a pan that starts and stops abruptly reads as a
 * glitch, and a pan that moves at a constant speed reads as a machine.
 */
const PAN_EASING = 'ease-in-out-cubic';

/**
 * The room the picture keeps around itself when it is fitted, in pixels.
 *
 * The room is the air of the design system: the picture does not touch the
 * edge of the canvas.
 */
const FIT_PADDING = 30;

/**
 * Whether the picture holds the same nodes as the ones it is given.
 *
 * The picture is **fitted** when it is drawn for the first time, and it is
 * never fitted again on its own: a picture that grows keeps the zoom of the
 * reader, and a card that appears does not move the picture under the
 * reader's feet.
 */
function sameNodes(current: Collection, nodes: readonly NodeDto[]): boolean {
  const cards = cardNodes(current);

  if (cards.length !== nodes.length) {
    return false;
  }

  const ids = new Set(cards.map((node) => node.id()));

  return nodes.every((node) => ids.has(node.id));
}

/**
 * The middle of a list of numbers.
 *
 * @param values - The numbers.
 * @returns The middle one, or zero when the list is empty.
 */
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

/**
 * Creates the Cytoscape instance of the exploration view.
 *
 * The instance starts **empty**: the elements are applied by
 * {@link ExplorationInstance.setElements}, which the app calls as soon as it
 * has data. That keeps the creation independent of the data.
 */
export function createExplorationInstance(
  options: ExplorationInstanceOptions
): ExplorationInstance {
  const core: Core = cytoscape({
    container: options.container,
    elements: [],
    style: EXPLORE_STYLESHEET,
    layout: { name: 'preset' },
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    // The picture can be moved and zoomed: the layout is a preset one, so
    // panning does not fight with it.
    userPanningEnabled: true,
    userZoomingEnabled: true,
    autoungrabify: false
  });

  let edgeStyle: EdgeStyle = 'bezier';
  let pinned = new Map<string, Position>();
  let layout: GraphLayout = 'dagre';

  /**
   * The floor of the fit, when the caller asks for one.
   *
   * The app asks for nothing: the fit of the picture is the fit.
   */
  let readableZoom: number | undefined = undefined;

  /**
   * The zoom of the **reader**.
   *
   * It is `null` when the reader never chose one: the picture is then
   * fitted — the whole graph in view — and the fit is the zoom the picture
   * starts with. Once the reader has chosen one (the wheel, the pinch, the
   * controls), the value is **theirs**: the picture never imposes a zoom
   * again — it grows and the zoom stays.
   */
  let readerZoom: number | null =
    options.zoom === undefined || options.zoom === null ? null : clampZoom(options.zoom);

  /**
   * Whether the picture has been fitted once.
   *
   * The fit happens **once**: the first picture is the whole graph in
   * view, and every picture after it keeps the zoom of the reader.
   */
  let fitted = false;

  /**
   * Whether the instance is moving the viewport itself.
   *
   * The zoom of the reader is told to the app when the **reader** changes
   * it: a fit or a pan of the instance is not a choice of the reader, and
   * it must not overwrite the value the reader has.
   */
  let adjustingViewport = false;

  /**
   * The greatest movement of the picture, in pixels.
   *
   * It is the distance a card travelled since the last time the picture was
   * drawn. A picture whose cards do not move any more has **settled**: the
   * layout is done and nothing keeps running.
   */
  let movement = Number.POSITIVE_INFINITY;

  /** Whether the picture has come to rest. */
  let settled = false;

  /** The places the cards were in the last time the picture was drawn. */
  let lastPositions = new Map<string, Position>();

  /**
   * How far a card may travel and still be said to have moved, in pixels.
   *
   * It is a pixel and a half: below it the picture is at rest, and the
   * layout is stopped.
   */
  const SETTLE_MOVEMENT = 1.5;

  /**
   * How many ticks of the spring run in one frame.
   *
   * The number is a **budget**: a tick of two hundred cards costs about a
   * millisecond, and three of them keep the frame of the canvas inside
   * the eight milliseconds that still read as a fluid picture — the work of
   * the picture itself (putting the cards in their places) is on top of
   * that.
   *
   * It is also what makes the spring **seen**: too many ticks in one frame
   * and the picture jumps instead of finding its place.
   */
  const TICKS_PER_FRAME = 3;

  /** The spring of the picture, while it is running. */
  let spring: ForceLayout | null = null;

  /** The driver of the spring: the frames it asks for. */
  let springDriver: ForceDriver | null = null;

  /**
   * Whether the reader is **dragging** a card.
   *
   * The spring does not fight the pointer: while the card is being dragged,
   * the simulation is paused and the card keeps the place the pointer puts
   * it in.
   */
  let dragging = false;

  /**
   * Whether the reader asked for less motion.
   *
   * The picture is the same one either way: with less motion the spring
   * runs to its conclusion in one go, without the intermediate frames.
   */
  function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }

    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Stops the spring.
   *
   * Nothing runs after this: no frame is asked for, no timer is left.
   */
  function stopSpring(): void {
    springDriver?.stop();
    springDriver = null;
    spring = null;
  }

  /**
   * Puts the cards where the spring put them.
   *
   * @param places - The place of every card.
   */
  function applyPlaces(places: ReadonlyMap<string, ForcePosition>): void {
    cardNodes(core.elements()).forEach((card) => {
      const place = places.get(card.id());

      if (place === undefined) {
        return;
      }

      card.position({ x: place.x, y: place.y });
    });

    // The card of a relation hangs beside its line, and the text of a card
    // hangs under its card: the picture moved, and they go with it.
    syncRelationCards();
    syncCardText(core);
  }

  /**
   * The pairs of cards that overlap, in the coordinates of the canvas.
   *
   * @returns How many pairs overlap.
   */
  function overlappingPairs(): number {
    const boxes = [...nodeBoxes().values()].map((box) => ({
      x: box.cx,
      y: box.cy,
      width: box.width,
      height: box.height
    }));

    return countOverlappingPairs(boxes);
  }

  /**
   * The frames of the animation.
   *
   * They are the frames of the browser: the spring runs in slices and the
   * picture is drawn between the slices.
   */
  const frames = {
    request(callback: () => void): number {
      return requestAnimationFrame(callback);
    },
    cancel(handle: number): void {
      cancelAnimationFrame(handle);
    }
  };

  /** The greatest distance a card travelled since the last picture. */
  function greatestMovement(): number {
    const cards = cardNodes(core.elements());
    const positions = new Map<string, Position>();

    let greatest = 0;

    cards.forEach((card) => {
      const position = card.position();
      positions.set(card.id(), position);

      const last = lastPositions.get(card.id());

      if (last === undefined) {
        return;
      }

      greatest = Math.max(greatest, Math.hypot(position.x - last.x, position.y - last.y));
    });

    lastPositions = positions;

    return greatest;
  }

  core.on('tap', 'node', (event) => {
    // The card of a relation is a node of its own: a tap on it is a tap on
    // the relation, not on a node of the window.
    const relation = relationIdOf(event.target);

    if (relation !== null) {
      options.onselectedge(relation);
      return;
    }

    options.onselect(cardIdOf(event.target));

    // The tap is also a walk: the user asked for the neighbourhood of this
    // node. The app decides what a walk means (a subgraph in one mode, a
    // merge in the other).
    options.onnavigate?.(cardIdOf(event.target));
  });

  core.on('tap', (event) => {
    if (event.target === core) {
      options.onselect(null);
    }
  });

  for (const kind of ['node', 'edge'] as const) {
    core.on('mouseover', kind, (event) => {
      const position = event.renderedPosition;
      const target = event.target;

      options.onpreview(
        {
          kind,
          // The text of a card is the writing on it: the pointer over it
          // points at the card it hangs under.
          id: kind === 'node' ? cardIdOf(target) : target.id(),
          x: position.x,
          y: position.y
        },
        null
      );
    });

    core.on('mouseout', kind, (event) => {
      const original = event.originalEvent as MouseEvent | undefined;

      options.onpreview(null, original?.relatedTarget ?? null);
    });
  }

  core.on('grab', 'node', () => {
    // The reader has the pointer down on a card: the spring stops, so the
    // picture does not fight the pointer.
    dragging = true;
    springDriver?.stop();
  });

  core.on('dragfree', 'node', (event) => {
    dragging = false;

    const place = event.target.position();

    // The card keeps the place it was put: the spring is told about it, so
    // the simulation works around it.
    spring?.pin(cardIdOf(event.target), { x: place.x, y: place.y });

    options.ondrag(cardIdOf(event.target), place);

    // The spring goes on with the rest of the picture.
    if (spring !== null && springDriver !== null && !spring.settled) {
      springDriver.start();
    }
  });

  // The text of a card follows the card while the user drags it, and the
  // card of a relation follows its line.
  core.on('drag', 'node', () => {
    syncRelationCards();
    syncCardText(core);
  });

  core.on('render', () => {
    movement = greatestMovement();

    if (movement < SETTLE_MOVEMENT) {
      settled = true;
    }

    options.onrender();
  });

  /**
   * The reader changed the zoom.
   *
   * The wheel, the pinch and the controls of the toolbar all end here: the
   * value is the reader's, and the app keeps it so that it survives the
   * change of the view of the graph.
   */
  core.on('zoom', () => {
    if (adjustingViewport) {
      // The instance is moving the viewport itself: the zoom of the reader
      // is not overwritten by a fit or by a pan.
      return;
    }

    const zoom = clampZoom(core.zoom());

    readerZoom = zoom;

    options.onzoom?.(zoom, 'reader');
  });

  /** The boxes of the nodes, in the model coordinates of the canvas. */
  function nodeBoxes(): Map<string, CardBox> {
    const boxes = new Map<string, CardBox>();

    cardNodes(core.elements()).forEach((node) => {
      const position = node.position();
      boxes.set(node.id(), {
        cx: position.x,
        cy: position.y,
        width: node.outerWidth(),
        height: node.outerHeight()
      });
    });

    return boxes;
  }

  /**
   * Puts the cards of the relations beside their lines.
   *
   * The card of a relation is **not** arranged by the layout: it belongs to
   * a line, and a line has no place in the arrangement of the nodes. So the
   * card is placed by hand, at the middle of its line and beside it, and it
   * is pushed further away when the place it chose is occupied by a node.
   *
   * The card never covers the nodes it connects: they are among the
   * obstacles.
   */
  function syncRelationCards(): void {
    const cards = relationCardNodes(core.elements());

    // Nothing to place: the picture does not pay for a relation that is not
    // expanded.
    if (cards.length === 0) {
      return;
    }

    const boxes = nodeBoxes();
    const obstacles = [...boxes.values()];

    cards.forEach((card) => {
      const relation = relationIdOf(card);

      if (relation === null) {
        return;
      }

      const line = core.getElementById(relation);

      if (line.length === 0) {
        return;
      }

      const source = boxes.get(line.source().id());
      const target = boxes.get(line.target().id());

      if (source === undefined || target === undefined) {
        return;
      }

      const place = relationCardPlacement(
        { x: source.cx, y: source.cy },
        { x: target.cx, y: target.cy },
        { width: card.outerWidth(), height: card.outerHeight() },
        obstacles
      );

      card.position(place);
    });
  }

  /**
   * Puts the nodes the user dragged back where they were put.
   *
   * The layout of `dagre` moves every node, and the `transform` hook of the
   * layout is never called by the library: the pinned places are put back
   * here, by hand, with the pure rule of `./layout`.
   */
  function applyPinnedPlaces(): void {
    if (pinned.size === 0) {
      return;
    }

    const transform = pinTransform(pinned);

    cardNodes(core.elements()).forEach((node) => {
      const current = node.position();
      const place = transform(node, current);

      if (place.x !== current.x || place.y !== current.y) {
        node.position(place);
      }
    });
  }

  /**
   * Draws the relations again.
   *
   * Every shape is a curve style and nothing more: **no shape is routed**,
   * so there is nothing to compute here beyond the style itself.
   */
  function refreshEdgeStyles(): void {
    const properties = edgeStyleProperties(edgeStyle);

    core.edges().forEach((edge) => {
      edge.style(properties);
    });
  }

  /** The node the view presented the last time the layout ran. */
  let lastPresented: string | null = null;

  /**
   * The canvas follows the size of its container.
   *
   * The window is resized, a panel opens and the canvas gets narrower: the
   * picture is redrawn at the new size and **only** that. The viewport is
   * not re-fitted and the layout is not run again — the picture stays where
   * the user left it, because a resize that re-fits moves the graph under
   * the reader's feet.
   */
  const stopObserving = observeContainerSize(options.container, () => {
    core.resize();
  });

  /**
   * Puts the whole picture in view.
   *
   * It is the **fit**: every node of the picture inside the box of the
   * canvas. The fit is the zoom the view starts with — and it is the
   * **only** zoom the view imposes: after this, the zoom belongs to the
   * reader.
   *
   * @param keepZoom - Whether the zoom of the reader is kept.
   * @param source - Who asked for the fit.
   *
   * The zoom is kept when the picture is drawn for the first time and the
   * reader already has one — the view was opened again after a change of
   * the mode of the graph: the fit only finds the **place** of the picture,
   * and the zoom of the reader is put back. It is **not** kept when the
   * reader asks for the fit: that is the choice they made.
   */
  function fitPicture(keepZoom: boolean, source: ZoomSource): void {
    const wanted = keepZoom ? readerZoom : null;

    adjustingViewport = true;

    try {
      core.fit(undefined, FIT_PADDING);

      const floor = readableZoom;

      if (floor !== undefined && core.zoom() < floor) {
        core.zoom(floor);
      }

      if (wanted !== null) {
        core.zoom(wanted);
      }
    } finally {
      adjustingViewport = false;
    }

    readerZoom = clampZoom(core.zoom());

    options.onzoom?.(readerZoom, source);
  }

  /**
   * Puts the zoom of the reader back on the picture.
   *
   * A picture that grows keeps the zoom it had: the reader chose it, and
   * the growth of the picture is not a reason to take it away.
   */
  function applyReaderZoom(): void {
    if (readerZoom === null) {
      return;
    }

    adjustingViewport = true;

    try {
      core.zoom(readerZoom);
    } finally {
      adjustingViewport = false;
    }
  }

  /**
   * Changes the zoom around the **centre** of the canvas.
   *
   * The zoom of the controls keeps the middle of the picture where it is:
   * a zoom that drifts towards the corner of the canvas loses the place the
   * reader was looking at.
   *
   * @param level - The zoom the picture goes to.
   */
  function zoomAroundCentre(level: number): void {
    const zoom = clampZoom(level);

    if (zoom === core.zoom()) {
      return;
    }

    core.zoom({
      level: zoom,
      renderedPosition: { x: core.width() / 2, y: core.height() / 2 }
    });
  }

  /**
   * Moves the picture onto a node, with a **smooth progression**.
   *
   * The movement is the animation of the renderer: the viewport glides onto
   * the node over {@link PAN_DURATION} milliseconds, eased in and out. The
   * zoom is **not** touched: a walk moves the picture, not the zoom.
   *
   * The pan does not fight the spring: the spring has already settled when
   * the pan starts, so the node is in its final place and the picture ends
   * centred on it.
   *
   * A reader who asked for less motion gets the picture in its place at
   * once: an instant pan is the correct behaviour for someone who asked
   * for less movement.
   *
   * @param nodeId - The id of the node the picture is centred on.
   */
  function panTo(nodeId: string): void {
    const node = core.getElementById(nodeId);

    if (node.length === 0) {
      return;
    }

    // The pan that is running is stopped: two pans at once would fight for
    // the same place.
    core.stop();

    if (prefersReducedMotion()) {
      core.center(node);

      return;
    }

    core.animate({
      center: { eles: node },
      duration: PAN_DURATION,
      easing: PAN_EASING
    });
  }

  /**
   * How far the node the view presents may be from the middle of the canvas
   * before the picture goes back to it.
   *
   * It is a quarter of the canvas: a layout that rearranges the picture
   * leaves the node a little to the side, and that is the reader's pan and
   * not something to correct. A layout that leaves it **far** behind is
   * something to correct: the view presents a node, and a node that the
   * picture left in a corner is not presented.
   */
  const CENTRE_TOLERANCE = 0.25;

  /**
   * Whether the node is far from the middle of the canvas.
   *
   * @param node - The node the view presents.
   * @returns Whether the picture has to go back to it.
   */
  function isFarFromCentre(node: Position): boolean {
    const zoom = core.zoom();
    const pan = core.pan();

    const x = node.x * zoom + pan.x;
    const y = node.y * zoom + pan.y;

    return (
      Math.abs(x - core.width() / 2) > (core.width() * CENTRE_TOLERANCE) / 2 ||
      Math.abs(y - core.height() / 2) > (core.height() * CENTRE_TOLERANCE) / 2
    );
  }

  /**
   * Puts the picture where it belongs after a layout.
   *
   * - the **first** picture is fitted: the whole graph in view;
   * - after that, the zoom is the reader's and nothing imposes it again:
   *   the picture grows and the zoom stays;
   * - a **walk** moves the picture onto the node the reader walked to, with
   *   an eased pan. The spring settles first, so the pan does not fight the
   *   simulation and the picture ends centred on the node;
   * - a layout that only rearranged the picture keeps the place the reader
   *   has, unless it left the node the view presents far behind.
   *
   * @param presentedNodeId - The node the view presents.
   * @param grew - Whether the picture holds nodes it did not hold before.
   */
  function presentPicture(presentedNodeId: string | null, grew: boolean): void {
    const presentedChanged = presentedNodeId !== lastPresented;
    lastPresented = presentedNodeId;

    if (!fitted && core.elements().length > 0) {
      // The picture is fitted the first time it is drawn — and only then.
      fitted = true;

      // The fit of the view: it is the zoom the picture starts with, and
      // not a choice of the reader.
      fitPicture(readerZoom !== null, 'view');

      return;
    }

    if (grew) {
      // The picture grew: the zoom of the reader stays, and the picture
      // grows around it.
      applyReaderZoom();
    }

    if (presentedNodeId === null) {
      return;
    }

    const node = core.getElementById(presentedNodeId);

    if (node.length === 0) {
      return;
    }

    if (presentedChanged || grew) {
      panTo(presentedNodeId);

      return;
    }

    if (isFarFromCentre(node.position())) {
      // The layout left the node the view presents far behind: the picture
      // goes back to it, with the same eased pan.
      panTo(presentedNodeId);
    }
  }

  /**
   * Runs the **spring** of the exploration view.
   *
   * The spring is the pure module of `./force-layout`: the cards are
   * given to it with the **real size** of their cards, and it answers with
   * the places they find.
   *
   * The picture is arranged **in slices**, across the frames: the reader
   * sees the cards find their place, and the simulation stops by itself
   * when it comes to rest. A reader who asked for less motion gets the
   * same picture in one go.
   *
   * @param presentedNodeId - The node the view presents.
   * @param grew - Whether the picture holds nodes it did not hold before.
   */
  function runSpring(presentedNodeId: string | null, grew: boolean): void {
    stopSpring();

    /** The time each frame of the animation took, in milliseconds. */
    const frameTimes: number[] = [];

    const inputs: ForceNodeInput[] = [];
    const links: ForceEdgeInput[] = [];

    // The picture the spring starts from.
    //
    // The **first** arrangement starts from the circle of the module: the
    // cards of a canvas that has never been drawn are all in the same
    // place, and a simulation that begins with every card in the same
    // place has nothing to push apart.
    //
    // The arrangements that follow start from **the picture as it is**: the
    // reader must see the cards rearrange around the new space, not jump
    // to a circle and spring out of it.
    const places = new Map<string, Position>();
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    cardNodes(core.elements()).forEach((card) => {
      const place = card.position();

      places.set(card.id(), place);
      minX = Math.min(minX, place.x);
      maxX = Math.max(maxX, place.x);
      minY = Math.min(minY, place.y);
      maxY = Math.max(maxY, place.y);
    });

    // The picture is **arranged** when its cards are not all in the same
    // place: a canvas that has never been drawn has them all in the
    // origin.
    const arranged = maxX - minX > 200 || maxY - minY > 200;

    cardNodes(core.elements()).forEach((card) => {
      const place = arranged ? places.get(card.id()) : undefined;

      inputs.push({
        id: card.id(),
        width: card.outerWidth(),
        height: card.outerHeight(),
        x: place?.x,
        y: place?.y
      });
    });

    core.edges().forEach((edge) => {
      links.push({ source: edge.source().id(), target: edge.target().id() });
    });

    const created = createForceLayout(inputs, links, { pinned });

    spring = created;

    // The picture is about to move: it has not settled yet.
    settled = false;
    movement = Number.POSITIVE_INFINITY;
    lastPositions = new Map<string, Position>();

    // The picture starts where the spring starts: the cards are put in
    // their places before the first frame, so the reader does not see them
    // jump from one place to another.
    applyPlaces(created.positions());

    // The relations are drawn with the shape the view was given.
    refreshEdgeStyles();

    // The picture is centred: the spring arranges it around the origin,
    // and the viewport has to show it.
    //
    // It is done **once**: the picture that follows keeps the place the
    // reader has, and the walk moves the picture with an eased pan.
    if (!fitted) {
      core.center(core.elements());
    }

    const report = (): void => {
      movement = greatestMovement();

      if (movement < SETTLE_MOVEMENT) {
        settled = true;
      }

      options.onlayout?.({
        layout: 'd3',
        ms: created.result().ms,
        settled: created.settled,
        movement,
        overlaps: overlappingPairs(),
        ticks: created.ticks,
        frameMs: median(frameTimes)
      });
    };

    if (prefersReducedMotion()) {
      // Less motion: the picture is arranged in one go, and it is the same
      // picture the animated path arrives at.
      const result = runForceLayoutToRest(created);

      applyPlaces(result.positions);
      presentPicture(presentedNodeId, grew);
      report();

      spring = null;

      return;
    }

    springDriver = driveForceLayout(created, {
      scheduler: frames,
      ticksPerFrame: TICKS_PER_FRAME,
      onFrame: (places) => {
        if (dragging) {
          // The reader has the pointer down on a card: the picture does not
          // move under the pointer.
          return;
        }

        const began = performance.now();

        applyPlaces(places);

        frameTimes.push(performance.now() - began);
      },
      onSettled: () => {
        springDriver = null;

        // The picture has come to rest: it is framed and the report goes
        // out.
        presentPicture(presentedNodeId, grew);
        report();
      }
    });

    springDriver.start();
  }

  /**
   * The relations of the picture, as the layouts see them.
   *
   * The text of a card is an element of its own and it takes no part in
   * the layouts: only the relations between the cards do.
   */
  function relationEdges(): DagEdgeInput[] {
    const links: DagEdgeInput[] = [];

    core.edges().forEach((edge) => {
      links.push({
        id: edge.id(),
        source: edge.source().id(),
        target: edge.target().id()
      });
    });

    return links;
  }

  /**
   * The relations whose arrow is drawn **against** the flow of the picture.
   *
   * It is the measure that compares the two layered arrangements on the
   * same thing: `dagre` reverses the relations that close a cycle and
   * draws them against what they say, and the clone of `dagre` does the
   * same — but it says which ones.
   */
  function reversedRelations(): string[] {
    const places = new Map<string, ForcePosition>();

    cardNodes(core.elements()).forEach((card) => {
      places.set(card.id(), card.position());
    });

    return [...relationsAgainstFlow(places, relationEdges(), 'LR')];
  }

  /**
   * Runs the **clone of `dagre`** — the layered arrangement of `d3-dag`.
   *
   * The clone is a **candidate**: it is in the comparison of the engines
   * and nowhere else. `dagre` stays in production.
   *
   * The arrangement is **synchronous** — a layered arrangement is computed
   * once — and it breaks the cycles of the relation graph on the way: the
   * relations it breaks are reported, so the reader is told.
   */
  function runDagLayout(presentedNodeId: string | null, grew: boolean): void {
    const inputs: DagNodeInput[] = [];
    const links = relationEdges();

    cardNodes(core.elements()).forEach((card) => {
      inputs.push({
        id: card.id(),
        width: card.outerWidth(),
        height: card.outerHeight()
      });
    });

    const result = createDagLayout(inputs, links);

    // The picture is about to move: it has not settled yet.
    settled = false;
    movement = Number.POSITIVE_INFINITY;
    lastPositions = new Map<string, Position>();

    applyPlaces(result.positions);

    // The nodes the user dragged keep the place they were put.
    applyPinnedPlaces();

    // The card of a relation is placed beside its line, and the text of a
    // card hangs under its card: the picture moved, and they go with it.
    syncRelationCards();
    syncCardText(core);

    refreshEdgeStyles();

    presentPicture(presentedNodeId, grew);

    movement = greatestMovement();

    options.onlayout?.({
      layout: 'dag',
      ms: result.ms,
      settled: true,
      movement,
      overlaps: overlappingPairs(),
      reversedRelations: result.brokenRelations
    });
  }

  /** Runs the layout and puts the picture back where it belongs. */
  function runLayout(presentedNodeId: string | null, grew: boolean): void {
    const currentLayout = layout;

    if (currentLayout === 'd3') {
      runSpring(presentedNodeId, grew);
      return;
    }

    if (currentLayout === 'dag') {
      runDagLayout(presentedNodeId, grew);
      return;
    }

    const layoutOptions = explorationLayoutOptions(currentLayout);

    if (currentLayout === 'fcose') {
      // The **force** layout needs a start: a simulation that begins with
      // every node in the same place has nothing to push apart. The nodes
      // are placed on a circle, deterministically, so the same graph always
      // starts from the same picture.
      const cards = cardNodes(core.elements());
      const seeds = seedCirclePositions(cards.length);

      cards.forEach((card, index) => {
        const seed = seeds[index];

        if (seed !== undefined) {
          card.position(seed);
        }
      });

      // The nodes the user dragged keep their place. The force layout is
      // **told** about them: its glide would fight a place set by hand.
      const constraints = [...pinned.entries()].map(([nodeId, position]) => ({
        nodeId,
        position
      }));

      if (constraints.length > 0 && 'fixedNodeConstraint' in layoutOptions) {
        layoutOptions.fixedNodeConstraint = constraints;
      }
    }

    // The picture is about to move: it has not settled yet.
    settled = false;
    movement = Number.POSITIVE_INFINITY;
    lastPositions = new Map<string, Position>();

    const started = Date.now();
    const runner = core.layout(cardLayoutOptions(layoutOptions, core));

    /**
     * Whether the layout **glides** the cards to their places.
     *
     * An animated layout moves the cards over the frames, and the picture
     * is only where it will be when the glide is over.
     */
    const animated = layoutOptions.animate === true;

    // The report is **additive**: the graph of the app does not read it, and
    // the development surface that compares the engines is the only reader.
    runner.one('layoutstop', () => {
      // The layout is done: the picture is measured one last time, and it
      // has come to rest.
      movement = greatestMovement();

      if (movement < SETTLE_MOVEMENT) {
        settled = true;
      }

      // An animated layout glides the cards to their places: the picture is
      // put back where it belongs **when the glide is over**. A fit taken
      // before it is a fit of the places the cards left.
      if (animated) {
        presentPicture(presentedNodeId, grew);
      }

      options.onlayout?.({
        layout: currentLayout,
        ms: Date.now() - started,
        settled,
        movement,
        overlaps: overlappingPairs(),
        // The relations that the layout had to break to order the graph:
        // `dagre` breaks them silently, and the report is how the
        // comparison of the engines tells the reader how many there were.
        //
        // The number is only meaningful for a **layered** arrangement: a
        // force layout has no layers and no flow, and a relation is not
        // "against" anything in it.
        reversedRelations: currentLayout === 'dagre' ? reversedRelations() : undefined
      });
    });

    runner.run();

    // The nodes the user dragged keep the place they were put: the layout
    // moves every node, and the pinned places are put back after it.
    applyPinnedPlaces();

    // The card of a relation is placed beside its line: the layout moved
    // the nodes, and the lines moved with them.
    syncRelationCards();

    // The text of a card hangs under the card: the layout moved the cards,
    // and the text goes with them.
    syncCardText(core);

    refreshEdgeStyles();

    // The picture is put back where it belongs — unless the layout is
    // still gliding, and then the `layoutstop` above does it.
    if (!animated) {
      presentPicture(presentedNodeId, grew);
    }
  }

  return {
    setElements(nodes, edges, elementOptions) {
      edgeStyle = elementOptions.edgeStyle;
      pinned = new Map(elementOptions.pinned);
      layout = elementOptions.layout ?? 'd3';
      readableZoom = elementOptions.readableZoom;

      // Whether the picture **grew**: it holds nodes it did not hold
      // before. A picture that grew is a walk, and a walk moves the picture
      // onto the node the reader walked to. A picture that only changed its
      // shape — a card that grew — keeps the place it had.
      const grew = !sameNodes(core.elements(), nodes);

      // The elements are patched, not re-created: the instance (and its
      // viewport) survives a new window.
      core.elements().remove();
      core.add(
        toGraphElements(nodes, edges, {
          expandedIds: elementOptions.expandedIds,
          expandedEdgeIds: elementOptions.expandedEdgeIds,
          locale: elementOptions.locale
        })
      );

      // The text of a card hangs under the card: it is placed before the
      // layout, and the layout moves the card and its text together.
      prepareCardText(core);

      this.setPresented(elementOptions.presentedNodeId);
      runLayout(elementOptions.presentedNodeId, grew);
    },

    setSelected(nodeId) {
      cardNodes(core.elements()).removeClass(SELECTED_CLASS);

      if (nodeId === null) {
        return;
      }

      const selected = core.getElementById(nodeId);

      if (selected.length > 0) {
        selected.addClass(SELECTED_CLASS);
      }
    },

    setPresented(nodeId) {
      cardNodes(core.elements()).removeClass(PRESENTED_CLASS);

      if (nodeId === null) {
        return;
      }

      const presented = core.getElementById(nodeId);

      if (presented.length > 0) {
        presented.addClass(PRESENTED_CLASS);
      }
    },

    setEdgeStyle(style) {
      edgeStyle = style;
      refreshEdgeStyles();
    },

    refreshEdgeStyles,

    positions() {
      const boxes = new Map<string, RenderedBox>();

      // The badges belong to the **cards**: the text of a card is not a node
      // of the window and has no badge of its own.
      cardNodes(core.elements()).forEach((node) => {
        const position = node.renderedPosition();
        boxes.set(node.id(), {
          x: position.x,
          y: position.y,
          width: node.renderedWidth(),
          height: node.renderedHeight()
        });
      });

      return boxes;
    },

    relationPositions() {
      const relations = new Map<string, RenderedRelation>();

      core.edges().forEach((edge) => {
        const source = edge.source().renderedPosition();
        const target = edge.target().renderedPosition();
        const middle = edge.renderedMidpoint();

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const length = Math.hypot(dx, dy);

        // The perpendicular of the line: the badge of a relation is placed
        // beside the line and not on it, and the line has no direction when
        // its two ends are in the same place.
        const nx = length === 0 ? 0 : -dy / length;
        const ny = length === 0 ? 1 : dx / length;

        relations.set(edge.id(), {
          x: middle.x,
          y: middle.y,
          nx,
          ny
        });
      });

      return relations;
    },

    relationCards() {
      const cards = new Map<string, RenderedBox>();

      // The card of a relation is a node of the picture: it is drawn in the
      // canvas and it moves with it.
      relationCardNodes(core.elements()).forEach((card) => {
        const relation = relationIdOf(card);

        if (relation === null) {
          return;
        }

        const position = card.renderedPosition();

        cards.set(relation, {
          x: position.x,
          y: position.y,
          width: card.renderedWidth(),
          height: card.renderedHeight()
        });
      });

      return cards;
    },

    zoom() {
      return clampZoom(core.zoom());
    },

    zoomIn() {
      zoomAroundCentre(core.zoom() * ZOOM_STEP);
    },

    zoomOut() {
      zoomAroundCentre(core.zoom() / ZOOM_STEP);
    },

    fitView() {
      // The reader asked for the fit: it is their choice, and it becomes
      // the zoom of the picture.
      fitPicture(false, 'reader');
    },

    destroy() {
      // The observer dies with the instance: a canvas that is gone must not
      // be resized any more.
      stopObserving();

      // The spring dies with it: no frame is asked for a canvas that is
      // not there any more.
      stopSpring();

      core.destroy();
    }
  };
}
