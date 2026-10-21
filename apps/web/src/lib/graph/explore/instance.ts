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
import { relationCardPlacement, type CardBox } from '../relation-card';
import { EXPLORE_STYLESHEET, PRESENTED_CLASS, SELECTED_CLASS } from './stylesheet';

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
   * The default is the zoom in which the title of a card can be read: a
   * card whose title cannot be read is not a card. The comparison of the
   * engines draws three pictures at once and asks for a smaller one, so
   * that the three pictures can be seen whole.
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
  /** Destroys the instance and releases the canvas. */
  destroy(): void;
}

/**
 * The smallest zoom the view starts at.
 *
 * Every node is a **card** with its title inside, so a window of two
 * hundred nodes does not fit in a canvas: the picture would be a hairball of
 * a few pixels per node, and a card whose title cannot be read is not a
 * card. The view starts close enough to **read** the shape of the graph —
 * the title of a card is twelve pixels, and it has to stay readable — and
 * the user pans and zooms from there.
 */
const MIN_READABLE_ZOOM = 0.75;

/**
 * Whether the picture holds the same nodes as the ones it is given.
 *
 * The picture is fitted again when the window changes, and kept as it is
 * when a node grows: a layout that moves the picture under the user's feet
 * while a card appears is a picture that cannot be read.
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
    minZoom: 0.1,
    maxZoom: 3,
    // The picture can be moved and zoomed: the layout is a preset one, so
    // panning does not fight with it.
    userPanningEnabled: true,
    userZoomingEnabled: true,
    autoungrabify: false
  });

  let edgeStyle: EdgeStyle = 'bezier';
  let pinned = new Map<string, Position>();
  let layout: GraphLayout = 'dagre';
  let readableZoom = MIN_READABLE_ZOOM;

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
   * Puts the picture where it belongs after a layout.
   *
   * The view centres on the node it presents — but only when that node
   * changes. A layout that runs because a card appeared rearranges the
   * picture **where it is**: the reader must see the neighbours move away
   * from the card, not the whole picture jump.
   *
   * @param presentedNodeId - The node the view presents.
   * @param fit - Whether the picture is fitted to the window.
   */
  function presentPicture(presentedNodeId: string | null, fit: boolean): void {
    const presentedChanged = presentedNodeId !== lastPresented;
    lastPresented = presentedNodeId;

    if (fit) {
      // The picture is fitted to the window the first time it is drawn — and
      // only then: a layout that runs again because a node grew must not
      // move the picture under the user's feet.
      core.fit(undefined, 30);

      if (core.zoom() < readableZoom) {
        core.zoom(readableZoom);
      }
    }

    if (presentedNodeId !== null && (fit || presentedChanged)) {
      const presented = core.getElementById(presentedNodeId);

      if (presented.length > 0) {
        core.center(presented);
      }
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
   * @param fit - Whether the picture is fitted to the window.
   */
  function runSpring(presentedNodeId: string | null, fit: boolean): void {
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
    core.center(core.elements());

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
      presentPicture(presentedNodeId, fit);
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
        presentPicture(presentedNodeId, fit);
        report();
      }
    });

    springDriver.start();
  }

  /** Runs the layout and puts the picture back where it belongs. */
  function runLayout(presentedNodeId: string | null, fit: boolean): void {
    const currentLayout = layout;

    if (currentLayout === 'd3') {
      runSpring(presentedNodeId, fit);
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

    // The report is **additive**: the graph of the app does not read it, and
    // the development surface that compares the engines is the only reader.
    runner.one('layoutstop', () => {
      // The layout is done: the picture is measured one last time, and it
      // has come to rest.
      movement = greatestMovement();

      if (movement < SETTLE_MOVEMENT) {
        settled = true;
      }

      options.onlayout?.({
        layout: currentLayout,
        ms: Date.now() - started,
        settled,
        movement,
        overlaps: overlappingPairs()
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

    presentPicture(presentedNodeId, fit);
  }

  return {
    setElements(nodes, edges, elementOptions) {
      edgeStyle = elementOptions.edgeStyle;
      pinned = new Map(elementOptions.pinned);
      layout = elementOptions.layout ?? 'd3';
      readableZoom = elementOptions.readableZoom ?? MIN_READABLE_ZOOM;

      // The picture is fitted again only when the window itself changed: a
      // layout that runs because a node grew keeps the viewport.
      const fit = !sameNodes(core.elements(), nodes);

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
      runLayout(elementOptions.presentedNodeId, fit);
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
