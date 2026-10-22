/**
 * The **clone of `dagre`** — the layered arrangement of `d3-dag`.
 *
 * The clone is a **candidate**: it is in the comparison of the engines and
 * nowhere else. `cytoscape-dagre` stays in production.
 *
 * The module is **development-only**, and the library `d3-dag` is imported
 * **here**: the comparison imports this module dynamically, behind
 * `import.meta.env.DEV`, and a production build has no comparison, no
 * clone and no Sugiyama — the whole implementation of `d3-dag` (forty
 * kilobytes gzipped) stays out of the bundle of the app.
 *
 * The production instance does **not** import this module: it receives the
 * clone as an **option** ({@link DagLayoutRunner}) when the comparison
 * mounts the engine. The instance knows the *shape* of the clone — the
 * places, the broken relations and the time — and the shape is a type, and
 * a type costs nothing in the bundle.
 *
 * The **cycles** are the work of the pure module
 * (`$lib/graph/explore/dag-layout`): this module only arranges the picture
 * with what that module found.
 */

import { dagre } from 'd3-dag';
import {
  detectCycles,
  type DagEdgeInput,
  type DagLayoutOptions,
  type DagLayoutResult,
  type DagNodeInput,
  type DagPosition
} from '$lib/graph/explore/dag-layout';

/**
 * The quality of the layout of `d3-dag`.
 *
 * It is **pinned to `fast`** on purpose: `medium` — the default of the
 * library — solves a linear program per layer, and on the fixture of two
 * hundred nodes and four hundred relations it took ninety seconds. The
 * cliff is a trap for whoever touches this line next.
 */
export const DAG_QUALITY = 'fast';

/**
 * The separation between two cards of the same layer, in pixels.
 *
 * It is the same separation the layout of `dagre` uses: the card holds its
 * own text, and the gap between two cards only has to hold the air.
 */
export const DAG_NODE_SEPARATION = 40;

/**
 * The separation between two layers, in pixels.
 *
 * It is the room the relation and its label need between two columns.
 */
export const DAG_RANK_SEPARATION = 80;

/** The clock of the module. */
function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

/**
 * Arranges the picture with `d3-dag`, breaking the cycles of the graph.
 *
 * The cycles are broken by **reversing** the relations that close them —
 * the back edges of the depth-first walk of `detectCycles`. The result is
 * always acyclic: the back edges of a depth-first walk are a **feedback
 * arc set**, and reversing all of them leaves a graph with no cycle. (The
 * theorem is checked over every graph of up to four nodes in the test of
 * the module, and it is the same rule `dagre` follows in its
 * `acyclic.js`.)
 *
 * @param nodes - The nodes of the picture, with the real size of their
 *   cards.
 * @param edges - The relations of the picture.
 * @param options - The options of the layout.
 * @returns The places of the nodes, the relations that were reversed and
 *   the cycles that were found.
 */
export function createDagLayout(
  nodes: readonly DagNodeInput[],
  edges: readonly DagEdgeInput[],
  options: DagLayoutOptions = {}
): DagLayoutResult {
  const rankDir = options.rankDir ?? 'LR';
  const nodeSep = options.nodeSep ?? DAG_NODE_SEPARATION;
  const rankSep = options.rankSep ?? DAG_RANK_SEPARATION;

  const { cycles, backEdges } = detectCycles(nodes, edges);
  const broken = new Set(backEdges);

  const graph = new dagre.graphlib.Graph();

  graph.setGraph({
    rankdir: rankDir,
    nodesep: nodeSep,
    ranksep: rankSep,
    // The preset is **pinned**: see {@link DAG_QUALITY}.
    quality: DAG_QUALITY
  });

  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    // `d3-dag` refuses a node without a size: the layout is built for
    // boxes, and a card of the app is a box. The size is clamped so a
    // card of zero pixels — a node without a title — does not stop the
    // layout.
    graph.setNode(node.id, {
      width: Math.max(1, node.width),
      height: Math.max(1, node.height)
    });
  }

  for (const edge of edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) {
      continue;
    }

    // A relation of a node with itself is a cycle of one: it cannot be
    // laid out, and it is left out of the layout.
    if (edge.source === edge.target) {
      continue;
    }

    const reversed = broken.has(edge.id);

    graph.setEdge(
      reversed ? edge.target : edge.source,
      reversed ? edge.source : edge.target
    );
  }

  const began = now();

  dagre.layout(graph);

  const ms = now() - began;

  const positions = new Map<string, DagPosition>();

  for (const node of nodes) {
    const place = graph.node(node.id);

    positions.set(node.id, { x: place.x, y: place.y });
  }

  return {
    positions,
    brokenRelations: [...broken],
    cycles,
    ms
  };
}
