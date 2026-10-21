/**
 * The **clone of `dagre`** that arranges the picture with `d3-dag`.
 *
 * The test says three things:
 *
 * - the module is **pure**: it arranges a picture with no canvas and no
 *   Cytoscape;
 * - the cycles of the relation graph are **found**, **broken** in a
 *   deterministic way and **reported** to the caller;
 * - the clone and the **incumbent** are compared on the same picture, and
 *   the number of relations each of them reverses is recorded. The number
 *   of the incumbent is **not zero**: `dagre` reverses the relations that
 *   close a cycle and draws the arrow against what the relation says, and
 *   the test is not weakened to hide it.
 */

import { describe, expect, it } from 'vitest';
import {
  createDagLayout,
  detectCycles,
  relationsAgainstFlow,
  type DagEdgeInput,
  type DagNodeInput,
  type DagPosition
} from '$lib/graph/explore/dag-layout';
import { countOverlappingPairs } from '$lib/graph/explore/force-layout';
import { cyclicFixture } from '$lib/dev/engines/dag-fixture';
import cytoscape from 'cytoscape';
import type { CytoscapeOptions } from 'cytoscape';
import dagre from 'cytoscape-dagre';

/** The size of the card of the small fixture. */
const CARD = { width: 140, height: 60 };

/**
 * A picture with **one** cycle in it: a → b → c → a.
 *
 * The relation that closes the cycle is `c → a`, and it is the one a
 * layout has to break.
 */
function triangle(): { nodes: DagNodeInput[]; edges: DagEdgeInput[] } {
  return {
    nodes: [
      { id: 'a', width: CARD.width, height: CARD.height },
      { id: 'b', width: CARD.width, height: CARD.height },
      { id: 'c', width: CARD.width, height: CARD.height }
    ],
    edges: [
      { id: 'edge-ab', source: 'a', target: 'b' },
      { id: 'edge-bc', source: 'b', target: 'c' },
      { id: 'edge-ca', source: 'c', target: 'a' }
    ]
  };
}

/**
 * Arranges the picture with the **incumbent** — `cytoscape` with the
 * layout of `dagre`, exactly as the product draws it.
 *
 * The core is **headless**: the layout of `dagre` does not need a canvas,
 * and the test is about the arrangement and not about the drawing.
 *
 * @param nodes - The nodes of the picture.
 * @param edges - The relations of the picture.
 * @returns The places of the nodes.
 */
function incumbentLayout(
  nodes: readonly DagNodeInput[],
  edges: readonly DagEdgeInput[]
): Map<string, DagPosition> {
  cytoscape.use(dagre);

  const container = document.createElement('div');

  document.body.appendChild(container);

  const core = cytoscape({
    container,
    // The **null** renderer: the core computes the styles — and with them
    // the real size of the cards — and draws nothing. The arrangement is
    // the thing that is measured, and it needs the size of the cards.
    renderer: { name: 'null' },
    elements: [
      ...nodes.map((node) => ({ data: { id: node.id, width: node.width, height: node.height } })),
      ...edges.map((edge) => ({
        data: { id: edge.id, source: edge.source, target: edge.target }
      }))
    ],
    style: [
      {
        selector: 'node',
        style: { width: 'data(width)', height: 'data(height)' }
      }
    ]
  } as unknown as CytoscapeOptions);

  core
    .layout({
      name: 'dagre',
      rankDir: 'LR',
      nodeSep: 40,
      edgeSep: 24,
      rankSep: 80,
      animate: false,
      fit: false
    } as unknown as Parameters<typeof core.layout>[0])
    .run();

  const positions = new Map<string, DagPosition>();

  core.nodes().forEach((node) => {
    const place = node.position();

    positions.set(node.id(), { x: place.x, y: place.y });
  });

  core.destroy();
  container.remove();

  return positions;
}

describe('the clone of dagre', () => {
  it('is pure: it arranges a picture with no canvas and no Cytoscape', () => {
    const { nodes, edges } = triangle();
    const result = createDagLayout(nodes, edges);

    // Every node has a place...
    expect(result.positions.size).toBe(nodes.length);

    // ...and the module touched neither the DOM nor a canvas.
    expect(document.body.innerHTML).toBe('');
    expect(document.querySelectorAll('canvas')).toHaveLength(0);
  });

  it('finds the cycle of a picture and names the relations that close it', () => {
    const { nodes, edges } = triangle();
    const report = detectCycles(nodes, edges);

    expect(report.cycles).toHaveLength(1);
    expect(report.cycles[0]?.nodes).toEqual(['a', 'b', 'c']);
    expect(report.cycles[0]?.relations).toEqual(['edge-ab', 'edge-bc', 'edge-ca']);

    // The relation that closes the cycle is the one that has to be broken.
    expect(report.backEdges).toEqual(['edge-ca']);
  });

  it('finds no cycle in a picture that has none', () => {
    const report = detectCycles(
      [
        { id: 'a', width: CARD.width, height: CARD.height },
        { id: 'b', width: CARD.width, height: CARD.height }
      ],
      [{ id: 'edge-ab', source: 'a', target: 'b' }]
    );

    expect(report.cycles).toHaveLength(0);
    expect(report.backEdges).toHaveLength(0);
  });

  it('reports the relations it broke to the caller', () => {
    const { nodes, edges } = triangle();
    const result = createDagLayout(nodes, edges);

    expect(result.brokenRelations).toEqual(['edge-ca']);
    expect(result.brokenRelations.length).toBeGreaterThan(0);
    expect(result.cycles).toHaveLength(1);
  });

  it('breaks the same relations on two runs', () => {
    const { nodes, edges } = cyclicFixture(60, 120);

    const first = createDagLayout(nodes, edges);
    const second = createDagLayout(nodes, edges);

    expect(second.brokenRelations).toEqual(first.brokenRelations);
    expect(first.brokenRelations.length).toBeGreaterThan(0);
  });

  it('gives the same places on two runs', () => {
    const { nodes, edges } = cyclicFixture(60, 120);

    const first = createDagLayout(nodes, edges);
    const second = createDagLayout(nodes, edges);

    for (const node of nodes) {
      expect(second.positions.get(node.id)).toEqual(first.positions.get(node.id));
    }
  });

  it('leaves no two cards on top of another on two hundred cards', () => {
    const { nodes, edges } = cyclicFixture(200, 400);
    const result = createDagLayout(nodes, edges);

    const boxes = nodes.map((node) => {
      const place = result.positions.get(node.id) as DagPosition;

      return { x: place.x, y: place.y, width: node.width, height: node.height };
    });

    expect(countOverlappingPairs(boxes)).toBe(0);
  });

  it('draws the relations it broke against the flow, and says so', () => {
    const { nodes, edges } = cyclicFixture(60, 120);
    const result = createDagLayout(nodes, edges);

    // The relations the clone broke are exactly the relations whose arrow
    // is drawn against the flow of the picture: the reader has to be told.
    const against = relationsAgainstFlow(result.positions, edges, 'LR');

    expect([...against].sort()).toEqual([...result.brokenRelations].sort());
    expect(against.length).toBeGreaterThan(0);
  });

  it('is compared with the incumbent on the same picture', () => {    const { nodes, edges } = cyclicFixture(200, 400);

    const clone = createDagLayout(nodes, edges);
    const incumbentPositions = incumbentLayout(nodes, edges);

    const cloneReversed = relationsAgainstFlow(clone.positions, edges, 'LR');
    const incumbentReversed = relationsAgainstFlow(incumbentPositions, edges, 'LR');

    console.log(
      `200 cards, 400 relations: the clone breaks ${cloneReversed.length} relations and the incumbent reverses ${incumbentReversed.length}`
    );

    // The incumbent reverses relations **silently**: `dagre` turns them
    // around to order the graph and draws the arrow against what the
    // relation says. The number is not zero, and the test is not weakened
    // to hide it.
    expect(incumbentReversed.length).toBeGreaterThan(0);

    // The clone breaks the relations of the same kind — the back edges of
    // the depth-first walk — and it **says** which ones.
    expect(cloneReversed.length).toBeGreaterThan(0);
    expect(clone.brokenRelations.length).toBe(cloneReversed.length);
  });
});

describe('the comparison of the two arrangements', () => {
  it('is not weakened: the incumbent reverses relations today', () => {
    // The demo of the seeded workspace has ten relations that close a
    // cycle, and `dagre` reverses them without saying a word. This test
    // pins the behaviour of the incumbent: if a future version of the
    // layout stopped reversing them, the count would fall to zero and
    // **this** test would fail.
    const { nodes, edges } = cyclicFixture(24, 35);
    const incumbentPositions = incumbentLayout(nodes, edges);
    const incumbentReversed = relationsAgainstFlow(incumbentPositions, edges, 'LR');

    console.log(`a picture with cycles: the incumbent reverses ${incumbentReversed.length}`);

    expect(incumbentReversed.length).toBeGreaterThan(0);
  });
});

/**
 * Whether a picture has **no cycle**.
 *
 * It is the check of the topological order: a picture without cycles has
 * an order of its nodes, and a picture with cycles does not.
 */
function isAcyclic(count: number, edges: ReadonlyArray<readonly [number, number]>): boolean {
  const incoming = new Array<number>(count).fill(0);
  const outgoing: number[][] = Array.from({ length: count }, () => []);

  for (const [source, target] of edges) {
    outgoing[source]?.push(target);
    incoming[target] = (incoming[target] ?? 0) + 1;
  }

  const ready = incoming.map((value, index) => (value === 0 ? index : -1)).filter((i) => i >= 0);
  let visited = 0;

  while (ready.length > 0) {
    const node = ready.shift() as number;

    visited += 1;

    for (const target of outgoing[node] ?? []) {
      incoming[target] = (incoming[target] ?? 0) - 1;

      if (incoming[target] === 0) {
        ready.push(target);
      }
    }
  }

  return visited === count;
}

describe('the theorem of the clone', () => {
  it('reversing the back edges always leaves a picture without cycles', () => {
    // The clone breaks the cycles by reversing the relations that close
    // them, and the theorem that makes it work is that the back edges of
    // a depth-first walk are a **feedback arc set**: reversing all of them
    // leaves a picture with no cycle.
    //
    // The theorem is checked here over **every** picture of up to four
    // nodes — sixty-six thousand of them, and every one of them is a
    // picture with no cycle left.
    let checked = 0;

    for (let count = 2; count <= 4; count += 1) {
      for (let mask = 0; mask < 1 << (count * count); mask += 1) {
        const edges: Array<readonly [number, number]> = [];

        for (let bit = 0; bit < count * count; bit += 1) {
          if ((mask >> bit) & 1) {
            const source = Math.floor(bit / count);
            const target = bit % count;

            if (source !== target) {
              edges.push([source, target]);
            }
          }
        }

        const nodes = Array.from({ length: count }, (_, index) => ({
          id: `n${index}`,
          width: CARD.width,
          height: CARD.height
        }));

        const relations = edges.map(([source, target], index) => ({
          id: `e${index}`,
          source: `n${source}`,
          target: `n${target}`
        }));

        const { backEdges } = detectCycles(nodes, relations);
        const broken = new Set(backEdges);

        const reversed = relations.map((relation) =>
          broken.has(relation.id)
            ? ([relation.target, relation.source] as const)
            : ([relation.source, relation.target] as const)
        );

        checked += 1;

        expect(
          isAcyclic(
            count,
            reversed.map(([source, target]) => [
              Number(source.slice(1)),
              Number(target.slice(1))
            ])
          )
        ).toBe(true);
      }
    }

    console.log(`the theorem holds over ${checked} pictures`);
    expect(checked).toBeGreaterThan(60_000);
  });
});
