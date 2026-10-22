/**
 * The **DAG layout** — the **pure** part of the clone of the layout of
 * `dagre`.
 *
 * The clone exists because the technology is worth trying **without losing
 * what is there**: `cytoscape-dagre` stays in production, and the clone is
 * a second arrangement of the same picture, side by side with the first
 * one, in the comparison of the engines.
 *
 * ## What a DAG is
 *
 * A **DAG** — a directed acyclic graph — is a graph with **no cycles**: if
 * A relates to B and B relates to C, it is impossible for C to relate back
 * to A. The algorithm of `d3-dag` is the Sugiyama algorithm, and Sugiyama
 * **assumes a DAG**: it puts the nodes in layers, and a layer is an order.
 * A cycle has no order.
 *
 * ## The graph of VozLab is not a DAG
 *
 * The relations of the graph are created in one direction and read in both,
 * and the demo of the seeded workspace has cycles: ten of them. So the
 * layout has to **break** the cycles before it can order the nodes, and the
 * question is *what does it break, and what does the reader see?*
 *
 * **`dagre` breaks them silently.** The file `acyclic.js` of the library
 * exists precisely to *reverse* the relations that close a cycle: the
 * layout is computed with the relation turned around, and the picture is
 * drawn with the arrow **against** what the relation says. Nobody had
 * noticed, because nobody had counted. It is a live bug of the product,
 * and this module counts it.
 *
 * ## What this module is
 *
 * It is a **pure module** — no DOM, no canvas, no Cytoscape — and it holds
 * the two things that are pure:
 *
 * - the **cycles** of the relation graph are found, and the relations that
 *   close them are named;
 * - the **measure of the flow**: the relations whose arrow is drawn
 *   against the flow of the picture.
 *
 * The **arrangement itself** — the Sugiyama of `d3-dag` — is **not** here:
 * the library belongs to the **development surface** (`$lib/dev/engines/dag`),
 * and the comparison of the engines hands it to the instance when it mounts
 * the engine. A production bundle carries the cycles and the measure, and
 * none of the library: the measure is what the report of `dagre` needs,
 * and the report is the only thing that reads it.
 *
 * The cycles are handled **visibly**:
 *
 * - they are **detected** before the layout, and the cycle is described;
 * - they are **broken** in a documented and deterministic way — the
 *   relations that close a cycle are reversed, exactly as `dagre` does it,
 *   and the theorem that makes the result acyclic is written down here;
 * - the relations that were broken are **reported** to the caller, so the
 *   interface can say how many of them there were.
 *
 * Reversing a relation and hiding it is the bug, not the fix: the caller
 * gets the list, and the comparison of the engines shows it.
 *
 * ## The model of the clone
 *
 * `d3-dag` needs **a positive width and a height for every node** — it is
 * built for boxes, and a card of the app is a box. It does **not** support
 * compound graphs: a node cannot have children. The cards of the app are
 * plain nodes, and the **text of a card is a sibling element** — a piece of
 * writing that hangs under its card and that the painter places by hand. It
 * is not a node of the layout: the clone arranges the **cards**, and the
 * text goes with the card, as it does with every other layout.
 */

/** The direction the layers flow in. */
export type DagRankDir = 'LR' | 'TB';

/** A place in the picture, in the coordinates of the canvas. */
export interface DagPosition {
  /** The x of the place. */
  readonly x: number;
  /** The y of the place. */
  readonly y: number;
}

/** A node of the picture, as the module sees it. */
export interface DagNodeInput {
  /** The id of the node. */
  readonly id: string;
  /** The width of the card of the node, in pixels. */
  readonly width: number;
  /** The height of the card of the node, in pixels. */
  readonly height: number;
}

/** A relation of the picture, as the module sees it. */
export interface DagEdgeInput {
  /** The id of the relation. */
  readonly id: string;
  /** The id of the node the relation comes from. */
  readonly source: string;
  /** The id of the node the relation goes to. */
  readonly target: string;
}

/** A cycle of the relation graph. */
export interface DagCycle {
  /**
   * The nodes of the cycle, in the order the walk found them.
   *
   * The first node is the one the cycle comes back to: the walk starts
   * there, goes down the relations and comes back.
   */
  readonly nodes: readonly string[];
  /** The relations of the cycle, in the same order. */
  readonly relations: readonly string[];
}

/** What the walk of the cycles found. */
export interface DagCycleReport {
  /** The cycles of the graph, in the order they were found. */
  readonly cycles: readonly DagCycle[];
  /**
   * The relations that close a cycle — the **back edges** of the walk.
   *
   * They are the relations the layout has to reverse to be able to order
   * the nodes.
   */
  readonly backEdges: readonly string[];
}

/** The options of the layout. */
export interface DagLayoutOptions {
  /** The direction the layers flow in. The default is `LR`, like `dagre`. */
  readonly rankDir?: DagRankDir;
  /** The separation between two cards of the same layer, in pixels. */
  readonly nodeSep?: number;
  /** The separation between two layers, in pixels. */
  readonly rankSep?: number;
}

/** What the layout tells when it is done. */
export interface DagLayoutResult {
  /** The place of every node. */
  readonly positions: ReadonlyMap<string, DagPosition>;
  /**
   * The relations that were **reversed** to be able to order the graph.
   *
   * The list is the answer to the question the reader asks: *how many
   * relations are drawn against what they say?*
   */
  readonly brokenRelations: readonly string[];
  /** The cycles that were found in the relation graph. */
  readonly cycles: readonly DagCycle[];
  /** The instant the layout took, in milliseconds. */
  readonly ms: number;
}

/**
 * The **clone** — the arrangement of the picture with `d3-dag`.
 *
 * It is a **function**, not a class, and it is **handed over** to the
 * instance instead of being imported by it: the library `d3-dag` is a
 * dependency of the **development surface** only, and an instance that
 * imported it would carry it into the production bundle.
 */
export type DagLayoutRunner = (
  nodes: readonly DagNodeInput[],
  edges: readonly DagEdgeInput[]
) => DagLayoutResult;

/**
 * The relations that come out of a node, in the order they were given.
 *
 * The order matters: the walk of the cycles is **deterministic** because
 * the relations of a node are always visited in the same order.
 */
function adjacencyOf(
  nodes: readonly DagNodeInput[],
  edges: readonly DagEdgeInput[]
): Map<string, Array<{ readonly target: string; readonly id: string }>> {
  const adjacency = new Map<string, Array<{ readonly target: string; readonly id: string }>>();

  for (const node of nodes) {
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    const relations = adjacency.get(edge.source);

    // A relation whose ends are not in the picture is not a relation of
    // this picture: it is ignored, and it is not a cycle either.
    if (relations === undefined || !adjacency.has(edge.target)) {
      continue;
    }

    relations.push({ target: edge.target, id: edge.id });
  }

  return adjacency;
}

/**
 * Finds the cycles of the relation graph.
 *
 * The walk is the classic **depth-first** walk with three colours: a node
 * that is not visited yet, a node that is on the stack and a node that is
 * finished. A relation that arrives at a node **on the stack** closes a
 * cycle: it is a **back edge**.
 *
 * The walk is deterministic — the nodes are visited in the order they were
 * given and the relations of a node in the order they were given — so two
 * runs over the same picture break the same relations.
 *
 * @param nodes - The nodes of the picture.
 * @param edges - The relations of the picture.
 * @returns The cycles and the relations that close them.
 */
export function detectCycles(
  nodes: readonly DagNodeInput[],
  edges: readonly DagEdgeInput[]
): DagCycleReport {
  const adjacency = adjacencyOf(nodes, edges);
  const cycles: DagCycle[] = [];
  const backEdges: string[] = [];

  /** 0 — not visited yet, 1 — on the stack, 2 — finished. */
  const colour = new Map<string, 0 | 1 | 2>();

  for (const node of nodes) {
    colour.set(node.id, 0);
  }

  /** The stack of the walk: the node and the relation that brought it. */
  const stack: Array<{ readonly id: string; readonly via: string | null; index: number }> = [];

  for (const start of nodes) {
    if (colour.get(start.id) !== 0) {
      continue;
    }

    colour.set(start.id, 1);
    stack.push({ id: start.id, via: null, index: 0 });

    while (stack.length > 0) {
      const frame = stack[stack.length - 1] as { id: string; via: string | null; index: number };
      const relations = adjacency.get(frame.id) ?? [];

      if (frame.index >= relations.length) {
        // The node is finished: it leaves the stack.
        colour.set(frame.id, 2);
        stack.pop();
        continue;
      }

      const relation = relations[frame.index] as { target: string; id: string };

      frame.index += 1;

      const targetColour = colour.get(relation.target) ?? 0;

      if (targetColour === 1) {
        // The relation comes back to a node of the stack: it closes a
        // cycle, and it is the relation the layout has to reverse.
        backEdges.push(relation.id);

        const cycleNodes: string[] = [];
        const cycleRelations: string[] = [];

        // The cycle is the part of the stack from the node the relation
        // comes back to, plus the relation itself.
        for (let index = stack.length - 1; index >= 0; index -= 1) {
          const ancestor = stack[index] as { id: string; via: string | null };

          cycleNodes.unshift(ancestor.id);

          if (ancestor.via !== null) {
            cycleRelations.unshift(ancestor.via);
          }

          if (ancestor.id === relation.target) {
            break;
          }
        }

        cycleRelations.push(relation.id);

        cycles.push({ nodes: cycleNodes, relations: cycleRelations });
        continue;
      }

      if (targetColour === 0) {
        colour.set(relation.target, 1);
        stack.push({ id: relation.target, via: relation.id, index: 0 });
      }
    }
  }

  return { cycles, backEdges };
}

/**
 * The relations whose arrow is drawn **against** the flow of the picture.
 *
 * It is the measure that compares the two arrangements on the same thing:
 * a relation that goes from a card on the right to a card on the left is
 * drawn against the reading of the picture, and the reader has to be told.
 *
 * For the clone the relations of the list are the ones it **reversed** to
 * order the graph. For `dagre` they are the ones the library reversed
 * **silently**: the layout is computed with the relation turned around and
 * the picture is drawn with the arrow against it. The two are the same
 * kind of thing, and the comparison of the engines shows them side by side.
 *
 * @param positions - The place of every node.
 * @param edges - The relations of the picture.
 * @param rankDir - The direction the layers flow in.
 * @returns The ids of the relations that go against the flow.
 */
export function relationsAgainstFlow(
  positions: ReadonlyMap<string, DagPosition>,
  edges: readonly DagEdgeInput[],
  rankDir: DagRankDir = 'LR'
): readonly string[] {
  const against: string[] = [];

  for (const edge of edges) {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);

    if (source === undefined || target === undefined) {
      continue;
    }

    const forward = rankDir === 'LR' ? target.x - source.x : target.y - source.y;

    if (forward < 0) {
      against.push(edge.id);
    }
  }

  return against;
}
