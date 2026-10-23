/**
 * The Cytoscape runtime.
 *
 * The module is imported **dynamically**, from the browser only: Cytoscape
 * draws to a `<canvas>`, so the server pass must never evaluate it. The
 * `dagre` layout is registered **once, at module level** (in
 * `./cytoscape-runtime`) — `cytoscape.use` is a global registration, not
 * something to repeat on every render.
 *
 * The instance is created once and **patched** afterwards: the elements are
 * removed and added again, never re-created, so the canvas keeps its
 * viewport, its zoom and its listeners.
 *
 * The instance also **follows the size of its container**: a `ResizeObserver`
 * redraws the picture when the window is resized, and the viewport is left
 * where the user put it.
 */

import type { DagreLayoutOptions } from 'cytoscape-dagre';
import type { Core } from 'cytoscape';
import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
import {
  GRAPH_STYLESHEET,
  cardIdOf,
  cardLayoutOptions,
  prepareCardText,
  syncCardText,
  toGraphElements
} from './elements';
import { observeContainerSize } from './resize';
import { cytoscape } from './cytoscape-runtime';
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, clampZoom, type ZoomSource } from './explore/zoom';

/** The class of the selected node. */
const SELECTED_CLASS = 'vozlab-selected';

/**
 * The layout of the canvas.
 *
 * `dagre` is **deterministic**: the same graph always yields the same
 * picture. There is no physics simulation — a `cose`/`force` layout would
 * keep moving the nodes and would burn the battery of a laptop for nothing.
 *
 * Every node is a **card**, and the separations are the room the cards need:
 *
 * - `nodeSep` is the gap **between two cards of the same column**. The card
 *   holds its own text — the title, the meta line and the body are all
 *   inside its rectangle — so the gap does not have to hold the meta line:
 *   it only has to hold the air between two cards. Forty pixels is plenty;
 * - `rankSep` is the gap **between two columns**. It holds the relation
 *   and its label, which is a key of the system written at eight pixels.
 *
 * The separations are small on purpose: the picture has to fit in the canvas
 * at a zoom where the titles can be read, and every extra pixel of gap is a
 * pixel the reader does not see.
 *
 * There is no `spacingFactor` here. It is not a knob of `dagre`: Cytoscape's
 * core applies it by pushing every node **away from the centre of the
 * picture**, so it only inflates the picture — it is a way of losing space,
 * and the separations are the only knob the layout needs.
 */
export const DAGRE_LAYOUT: DagreLayoutOptions = {
  name: 'dagre',
  rankDir: 'LR',
  nodeSep: 40,
  edgeSep: 20,
  rankSep: 80,
  animate: false,
  // The viewport is **not** fitted by the layout: the zoom belongs to the
  // reader, and the view fits the picture itself, the first time it draws
  // it.
  fit: false
};

/**
 * How long the pan of a walk takes, in milliseconds.
 *
 * It is a third of a second: long enough to be seen as a **movement** and
 * short enough not to be waited for.
 */
const PAN_DURATION = 320;

/**
 * The shape of the pan of a walk.
 *
 * It is eased in and out: a pan that starts and stops abruptly reads as a
 * glitch.
 */
const PAN_EASING = 'ease-in-out-cubic';

/**
 * The room the picture keeps around itself when it is fitted, in pixels.
 */
const FIT_PADDING = 20;

/** What the canvas reports back to the app. */
export interface GraphInstance {
  /** Replaces the elements of the graph and re-runs the layout. */
  setElements(
    nodes: readonly NodeDto[],
    edges: readonly SubgraphEdgeDto[],
    options?: GraphElementsOptions
  ): void;
  /** Highlights the selected node (and clears the previous highlight). */
  setSelected(nodeId: string | null): void;
  /** Centres the picture on a node — the node the user walked to. */
  centerOn(nodeId: string): void;
  /** The zoom of the picture, in the range of the reader. */
  zoom(): number;
  /** Comes closer to the picture, one step. */
  zoomIn(): void;
  /** Goes away from the picture, one step. */
  zoomOut(): void;
  /** Puts the whole picture in view. */
  fitView(): void;
  /** Destroys the instance and releases the canvas. */
  destroy(): void;
}

/** How the elements of the canvas are drawn. */
export interface GraphElementsOptions {
  /**
   * The node the view centres on when the picture does not fit.
   *
   * It is the **root** of the subgraph: the node the reader chose is the one
   * the view has to show when it cannot show everything.
   */
  focusNodeId?: string | null;
  /**
   * The language of the interface.
   *
   * The name of the class of a node, the name of the relation of an edge
   * and the status of a node are read in it.
   */
  locale?: string;
}

/** The options of {@link createGraphInstance}. */
export interface GraphInstanceOptions {
  /** The DOM element the canvas is drawn in. */
  container: HTMLElement;
  /** Called with the id of the tapped node, or `null` for the background. */
  onselect: (nodeId: string | null) => void;
  /**
   * Called with the id of the tapped node when the user **walks** to it.
   *
   * A tap on a node selects it and re-roots the subgraph on it: the two
   * are told apart here so the app can answer them differently.
   */
  onnavigate?: (nodeId: string) => void;
  /**
   * The zoom the reader had when the view was opened.
   *
   * It is `null` when the reader never chose one: the picture is then
   * **fitted** — the whole graph in view — and the fit is the zoom that
   * picture starts with.
   */
  zoom?: number | null;
  /**
   * Called when the zoom of the picture changes.
   *
   * The app keeps the value: the zoom survives the change of the view of
   * the graph — the two views are the same workspace.
   *
   * The **source** says who changed it: the reader (the wheel, the pinch,
   * the controls) or the view (the fit of the picture).
   */
  onzoom?: (zoom: number, source: ZoomSource) => void;
}

/**
 * Creates the Cytoscape instance of the canvas.
 *
 * The instance starts **empty**: the elements are applied by
 * {@link GraphInstance.setElements}, which the app calls as soon as it has
 * data. That keeps the creation independent of the data — a new subgraph
 * never re-creates the instance.
 */
export function createGraphInstance(options: GraphInstanceOptions): GraphInstance {
  const core: Core = cytoscape({
    container: options.container,
    elements: [],
    style: GRAPH_STYLESHEET,
    layout: { ...DAGRE_LAYOUT },
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    autoungrabify: true
  });

  /**
   * The zoom of the **reader**.
   *
   * It is `null` when the reader never chose one: the picture is then
   * fitted — the whole graph in view — and the fit is the zoom the picture
   * starts with. Once the reader has chosen one (the wheel, the pinch, the
   * controls), the value is **theirs**: the picture never imposes a zoom
   * again.
   */
  let readerZoom: number | null =
    options.zoom === undefined || options.zoom === null ? null : clampZoom(options.zoom);

  /** Whether the picture has been fitted once. */
  let fitted = false;
  let userInteracted = false;

  /**
   * Whether the instance is moving the viewport itself.
   *
   * A fit or a pan of the instance is not a choice of the reader, and it
   * must not overwrite the value the reader has.
   */
  let adjustingViewport = false;

  core.on('tap', 'node', (event) => {
    const id = cardIdOf(event.target);

    options.onselect(id);

    // The tap is also a walk: the user asked for the neighbourhood of this
    // node, and the app decides what a walk means.
    options.onnavigate?.(id);
  });

  // The text of a card follows the card while the user drags it.
  core.on('drag', 'node', () => {
    syncCardText(core);
  });

  core.on('tap', (event) => {
    if (event.target === core) {
      options.onselect(null);
    }
  });

  /**
   * The reader changed the zoom.
   *
   * The wheel, the pinch and the controls of the toolbar all end here.
   */
  core.on('zoom', () => {
    if (adjustingViewport) {
      return;
    }

    userInteracted = true;

    const zoom = clampZoom(core.zoom());

    readerZoom = zoom;

    options.onzoom?.(zoom, 'reader');
  });

  /**
   * The canvas follows the size of its container.
   *
   * The window is resized, a panel opens and the canvas gets narrower: the
   * picture is redrawn at the new size and **only** that. The viewport is
   * not re-fitted — the picture stays where the user left it, because a
   * resize that re-fits moves the graph under the reader's feet.
   */
  const stopObserving = observeContainerSize(options.container, () => {
    core.resize();
  });

  /**
   * Puts the whole picture in view.
   *
   * It is the **fit**: every node of the picture inside the box of the
   * canvas. When the reader already has a zoom, the fit only finds the
   * place of the picture and the zoom of the reader is put back.
   */
  function fitPicture(keepZoom: boolean, source: ZoomSource): void {
    const wanted = keepZoom ? readerZoom : null;

    adjustingViewport = true;

    try {
      core.fit(undefined, FIT_PADDING);

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
   * Changes the zoom around the **centre** of the canvas.
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

  return {
    setElements(nodes, edges, elementOptions = {}) {
      // The elements are patched, not re-created: the instance (and its
      // viewport) survives a new subgraph.
      core.elements().remove();
      core.add(toGraphElements(nodes, edges, { locale: elementOptions.locale }));

      // The text of a card hangs under the card: it is placed before the
      // layout, and the layout moves the card and its text together.
      prepareCardText(core);

      // The layout arranges the **cards**: the text of a card is not a node
      // of the graph, it is the writing on it.
      core.layout(cardLayoutOptions(DAGRE_LAYOUT, core)).run();

      // The text of a card hangs under the card: the layout moved the card,
      // and the text goes with it.
      syncCardText(core);

      if (!fitted && core.elements().length > 0) {
        // The picture is fitted the first time it is drawn — and only then:
        // after that the zoom belongs to the reader.
        fitted = true;

        // The fit of the view: it is the zoom the picture starts with, and
        // not a choice of the reader.
        fitPicture(readerZoom !== null, 'view');

        // The container may not have its final size yet on the first paint;
        // re-fit a moment later so the picture lands in a tighter frame.
        setTimeout(() => {
          if (userInteracted) {
            return;
          }
          adjustingViewport = true;
          try {
            core.fit(undefined, FIT_PADDING);
            readerZoom = clampZoom(core.zoom());
            options.onzoom?.(readerZoom, 'view');
          } finally {
            adjustingViewport = false;
          }
        }, 400);
      }
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

    centerOn(nodeId) {
      const node = core.getElementById(nodeId);

      if (node.length === 0) {
        return;
      }

      // The pan that is running is stopped: two pans at once would fight
      // for the same place.
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

      core.destroy();
    }
  };
}

/**
 * Whether the reader asked for less motion.
 *
 * A reader who asked for less motion gets the picture in its place at
 * once: an instant pan is the correct behaviour for someone who asked for
 * less movement.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
