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
import { GRAPH_STYLESHEET, toGraphElements } from './elements';
import { observeContainerSize } from './resize';
import { cytoscape } from './cytoscape-runtime';

/** The class of the selected node. */
const SELECTED_CLASS = 'vozlab-selected';

/**
 * The layout of the canvas.
 *
 * `dagre` is **deterministic**: the same graph always yields the same
 * picture. There is no physics simulation — a `cose`/`force` layout would
 * keep moving the nodes and would burn the battery of a laptop for nothing.
 */
export const DAGRE_LAYOUT: DagreLayoutOptions = {
  name: 'dagre',
  rankDir: 'LR',
  nodeSep: 40,
  edgeSep: 20,
  rankSep: 80,
  spacingFactor: 1.1,
  animate: false,
  fit: true
};

/** What the canvas reports back to the app. */
export interface GraphInstance {
  /** Replaces the elements of the graph and re-runs the layout. */
  setElements(nodes: readonly NodeDto[], edges: readonly SubgraphEdgeDto[]): void;
  /** Highlights the selected node (and clears the previous highlight). */
  setSelected(nodeId: string | null): void;
  /** Destroys the instance and releases the canvas. */
  destroy(): void;
}

/** The options of {@link createGraphInstance}. */
export interface GraphInstanceOptions {
  /** The DOM element the canvas is drawn in. */
  container: HTMLElement;
  /** Called with the id of the tapped node, or `null` for the background. */
  onselect: (nodeId: string | null) => void;
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
    minZoom: 0.1,
    maxZoom: 3
  });

  core.on('tap', 'node', (event) => {
    options.onselect(event.target.id());
  });

  core.on('tap', (event) => {
    if (event.target === core) {
      options.onselect(null);
    }
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

  return {
    setElements(nodes, edges) {
      // The elements are patched, not re-created: the instance (and its
      // viewport) survives a new subgraph.
      core.elements().remove();
      core.add(toGraphElements(nodes, edges));
      core.layout({ ...DAGRE_LAYOUT }).run();
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

    destroy() {
      // The observer dies with the instance: a canvas that is gone must not
      // be resized any more.
      stopObserving();
      core.destroy();
    }
  };
}
