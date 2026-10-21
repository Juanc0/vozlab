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
 * - the relations are drawn with the shape the user chose, and the
 *   orthogonal shape is routed by the pure router of `./orthogonal`;
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
import { exploreLayoutOptions, pinTransform } from './layout';
import { routeOrthogonal, type Box } from './orthogonal';
import { relationCardPlacement } from '../relation-card';
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
  refreshRoutes(): void;
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

  core.on('dragfree', 'node', (event) => {
    options.ondrag(cardIdOf(event.target), event.target.position());
  });

  // The text of a card follows the card while the user drags it, and the
  // card of a relation follows its line.
  core.on('drag', 'node', () => {
    syncRelationCards();
    syncCardText(core);
  });

  core.on('render', () => {
    options.onrender();
  });

  /** The boxes of the nodes, in the model coordinates of the canvas. */
  function nodeBoxes(): Map<string, Box> {
    const boxes = new Map<string, Box>();

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
   * The orthogonal shape is routed by the pure router: the turn it answers
   * is the channel between the two nodes that no card stands in.
   */
  function refreshRoutes(): void {
    const boxes = nodeBoxes();
    const all = [...boxes.values()];

    core.edges().forEach((edge) => {
      const source = boxes.get(edge.source().id());
      const target = boxes.get(edge.target().id());

      if (source === undefined || target === undefined) {
        return;
      }

      const obstacles = all.filter(
        (box) => box !== source && box !== target
      );

      const route = routeOrthogonal(source, target, obstacles);
      edge.style(edgeStyleProperties(edgeStyle, route));
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

  /** Runs the layout and puts the picture back where it belongs. */
  function runLayout(presentedNodeId: string | null, fit: boolean): void {
    core.layout(cardLayoutOptions(exploreLayoutOptions(), core)).run();

    // The nodes the user dragged keep the place they were put: the layout
    // moves every node, and the pinned places are put back after it.
    applyPinnedPlaces();

    // The card of a relation is placed beside its line: the layout moved
    // the nodes, and the lines moved with them.
    syncRelationCards();

    // The text of a card hangs under the card: the layout moved the cards,
    // and the text goes with them.
    syncCardText(core);

    refreshRoutes();

    // The view centres on the node it presents — but only when that node
    // changes. A layout that runs because a card appeared rearranges the
    // picture **where it is**: the reader must see the neighbours move away
    // from the card, not the whole picture jump.
    const presentedChanged = presentedNodeId !== lastPresented;
    lastPresented = presentedNodeId;

    if (fit) {
      // The picture is fitted to the window the first time it is drawn — and
      // only then: a layout that runs again because a node grew must not
      // move the picture under the user's feet.
      core.fit(undefined, 30);

      if (core.zoom() < MIN_READABLE_ZOOM) {
        core.zoom(MIN_READABLE_ZOOM);
      }
    }

    if (presentedNodeId !== null && (fit || presentedChanged)) {
      const presented = core.getElementById(presentedNodeId);

      if (presented.length > 0) {
        core.center(presented);
      }
    }
  }

  return {
    setElements(nodes, edges, elementOptions) {
      edgeStyle = elementOptions.edgeStyle;
      pinned = new Map(elementOptions.pinned);

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
      refreshRoutes();
    },

    refreshRoutes,

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
      core.destroy();
    }
  };
}
