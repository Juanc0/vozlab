/**
 * The Cytoscape instance of the **exploration view**.
 *
 * It is a second canvas, next to the one of the subgraph: the instance is
 * created once and its elements are patched afterwards, exactly like the
 * subgraph's. What it adds over the subgraph is the interaction:
 *
 * - the node that is **presented** (the focus) wears a ring of its own;
 * - a node can be **expanded** — drawn as a card — and the layout is run
 *   again so the picture rearranges around the new space;
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

import type { Core, NodeCollection, Position } from 'cytoscape';
import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
import { toGraphElements } from '../elements';
import { observeContainerSize } from '../resize';
import { cytoscape } from '../cytoscape-runtime';
import { edgeStyleProperties, type EdgeStyle } from './edge-style';
import { exploreLayoutOptions } from './layout';
import { routeOrthogonal, type Box } from './orthogonal';
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
  /** The shape the relations are drawn with. */
  edgeStyle: EdgeStyle;
  /** The node the view presents. */
  presentedNodeId: string | null;
  /** The places the user put the dragged nodes in. */
  pinned: ReadonlyMap<string, Position>;
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
  /** Destroys the instance and releases the canvas. */
  destroy(): void;
}

/**
 * The smallest zoom the view starts at.
 *
 * A window of two hundred nodes does not fit in a canvas: the picture would
 * be a hairball of a few pixels per node. The view starts close enough to
 * read the shape of the graph, and the user pans and zooms from there.
 */
const MIN_READABLE_ZOOM = 0.35;

/**
 * Whether the picture holds the same nodes as the ones it is given.
 *
 * The picture is fitted again when the window changes, and kept as it is
 * when a node grows: a layout that moves the picture under the user's feet
 * while a card appears is a picture that cannot be read.
 */
function sameNodes(current: NodeCollection, nodes: readonly NodeDto[]): boolean {
  if (current.length !== nodes.length) {
    return false;
  }

  const ids = new Set(current.map((node) => node.id()));

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
    options.onselect(event.target.id());
  });

  core.on('tap', (event) => {
    if (event.target === core) {
      options.onselect(null);
    }
  });

  for (const kind of ['node', 'edge'] as const) {
    core.on('mouseover', kind, (event) => {
      const position = event.renderedPosition;

      options.onpreview(
        {
          kind,
          id: event.target.id(),
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
    options.ondrag(event.target.id(), event.target.position());
  });

  core.on('render', () => {
    options.onrender();
  });

  /** The boxes of the nodes, in the model coordinates of the canvas. */
  function nodeBoxes(): Map<string, Box> {
    const boxes = new Map<string, Box>();

    core.nodes().forEach((node) => {
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
  function runLayout(
    expandedIds: ReadonlySet<string>,
    presentedNodeId: string | null,
    fit: boolean
  ): void {
    core.layout(
      exploreLayoutOptions({ expandedCount: expandedIds.size, pinned })
    ).run();

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
      const fit = !sameNodes(core.nodes(), nodes);

      // The elements are patched, not re-created: the instance (and its
      // viewport) survives a new window.
      core.elements().remove();
      core.add(toGraphElements(nodes, edges, { expandedIds: elementOptions.expandedIds }));

      this.setPresented(elementOptions.presentedNodeId);
      runLayout(elementOptions.expandedIds, elementOptions.presentedNodeId, fit);
    },

    setSelected(nodeId) {
      core.nodes().removeClass(SELECTED_CLASS);

      if (nodeId === null) {
        return;
      }

      const selected = core.getElementById(nodeId);

      if (selected.length > 0) {
        selected.addClass(SELECTED_CLASS);
      }
    },

    setPresented(nodeId) {
      core.nodes().removeClass(PRESENTED_CLASS);

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

      core.nodes().forEach((node) => {
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

    destroy() {
      // The observer dies with the instance: a canvas that is gone must not
      // be resized any more.
      stopObserving();
      core.destroy();
    }
  };
}
