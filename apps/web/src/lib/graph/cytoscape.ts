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
  fit: true
};

/**
 * The smallest zoom the canvas starts at.
 *
 * Every node is a **card** with its title inside it, so a subgraph that does
 * not fit in a canvas would be a picture of unreadable rectangles. The view
 * starts close enough to **read** the cards — the title of a card is twelve
 * pixels, and it has to stay readable — and the reader pans and zooms from
 * there.
 */
const MIN_READABLE_ZOOM = 0.75;

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
   * The name of every type, in the language of the interface.
   *
   * The key is the type key of the node and the value is the **display
   * name** of the class of the ontology.
   */
  typeNames?: ReadonlyMap<string, string>;
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
    options.onselect(cardIdOf(event.target));
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
    setElements(nodes, edges, elementOptions = {}) {
      // The elements are patched, not re-created: the instance (and its
      // viewport) survives a new subgraph.
      core.elements().remove();
      core.add(toGraphElements(nodes, edges, { typeNames: elementOptions.typeNames }));

      // The text of a card hangs under the card: it is placed before the
      // layout, and the layout moves the card and its text together.
      prepareCardText(core);

      // The layout arranges the **cards**: the text of a card is not a node
      // of the graph, it is the writing on it.
      core.layout(cardLayoutOptions(DAGRE_LAYOUT, core)).run();

      // The text of a card hangs under the card: the layout moved the card,
      // and the text goes with it.
      syncCardText(core);

      // A picture that does not fit is read at a zoom where the cards are
      // still cards: the view centres on the root, the node the reader
      // chose.
      if (core.zoom() < MIN_READABLE_ZOOM) {
        core.zoom(MIN_READABLE_ZOOM);

        const focus = elementOptions.focusNodeId;

        if (focus !== undefined && focus !== null) {
          const node = core.getElementById(focus);

          if (node.length > 0) {
            core.center(node);
          }
        }
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

    destroy() {
      // The observer dies with the instance: a canvas that is gone must not
      // be resized any more.
      stopObserving();
      core.destroy();
    }
  };
}
