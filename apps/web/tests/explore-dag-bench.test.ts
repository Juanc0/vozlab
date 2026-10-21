/**
 * The **measurements** of the clone of `dagre`.
 *
 * They are the numbers the comparison of the engines shows: the time the
 * arrangement takes, the pairs of cards that end up on top of each other,
 * whether the same picture comes out twice, and — the number that matters
 * here — **the relations each arrangement has to reverse** to be able to
 * order the graph.
 *
 * The test does not fail on a slow machine: it fails when an arrangement
 * does not do its work (a card on top of another one) or when it hides the
 * relations it broke.
 */

import { describe, expect, it } from 'vitest';
import cytoscape from 'cytoscape';
import type { CytoscapeOptions } from 'cytoscape';
import dagre from 'cytoscape-dagre';
import {
  createDagLayout,
  relationsAgainstFlow,
  type DagEdgeInput,
  type DagNodeInput,
  type DagPosition
} from '$lib/graph/explore/dag-layout';
import { countOverlappingPairs } from '$lib/graph/explore/force-layout';
import { cyclicFixture } from '$lib/dev/engines/dag-fixture';

/** What an arrangement tells about itself. */
interface Measurement {
  readonly ms: number;
  readonly overlaps: number;
  readonly reversed: number;
}

/**
 * Arranges the picture with the **incumbent** — `cytoscape` with the
 * layout of `dagre`, exactly as the product draws it.
 *
 * The core is **headless**: the layout does not need a canvas, and the
 * measurement is about the arrangement and not about the drawing.
 */
function incumbent(
  nodes: readonly DagNodeInput[],
  edges: readonly DagEdgeInput[]
): Measurement {
  cytoscape.use(dagre);

  const container = document.createElement('div');

  document.body.appendChild(container);

  const core = cytoscape({
    container,
    // The **null** renderer: the core computes the styles — and with them
    // the real size of the cards — and draws nothing.
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

  const began = performance.now();

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

  const ms = performance.now() - began;

  const positions = new Map<string, DagPosition>();

  core.nodes().forEach((node) => {
    const place = node.position();

    positions.set(node.id(), { x: place.x, y: place.y });
  });

  core.destroy();
  container.remove();

  const boxes = nodes.map((node) => {
    const place = positions.get(node.id) as DagPosition;

    return { x: place.x, y: place.y, width: node.width, height: node.height };
  });

  return {
    ms,
    overlaps: countOverlappingPairs(boxes),
    reversed: relationsAgainstFlow(positions, edges, 'LR').length
  };
}

/**
 * Arranges the picture with the **clone** — the pure module of
 * `./dag-layout`, with the preset `fast` of `d3-dag`.
 */
function clone(nodes: readonly DagNodeInput[], edges: readonly DagEdgeInput[]): Measurement {
  const result = createDagLayout(nodes, edges);

  const boxes = nodes.map((node) => {
    const place = result.positions.get(node.id) as DagPosition;

    return { x: place.x, y: place.y, width: node.width, height: node.height };
  });

  return {
    ms: result.ms,
    overlaps: countOverlappingPairs(boxes),
    reversed: result.brokenRelations.length
  };
}

describe('the measurements of the clone of dagre', () => {
  it('measures both arrangements on the picture of two hundred cards', () => {
    const { nodes, edges } = cyclicFixture(200, 400);

    const cloned = clone(nodes, edges);
    const incumbentMeasurement = incumbent(nodes, edges);

    console.log(
      `200 cards, 400 relations — d3-dag (fast): ${cloned.ms.toFixed(1)} ms, ${cloned.overlaps} overlapping pairs, ${cloned.reversed} relations reversed · dagre: ${incumbentMeasurement.ms.toFixed(1)} ms, ${incumbentMeasurement.overlaps} overlapping pairs, ${incumbentMeasurement.reversed} relations reversed`
    );

    // Neither arrangement leaves a card on top of another one.
    expect(cloned.overlaps).toBe(0);
    expect(incumbentMeasurement.overlaps).toBe(0);

    // Both of them have to reverse relations, and **both of them say
    // nothing about it**: the number is the same because the two break the
    // cycles with the same rule — the back edges of the depth-first walk.
    expect(cloned.reversed).toBeGreaterThan(0);
    expect(incumbentMeasurement.reversed).toBeGreaterThan(0);
  });

  it('measures both arrangements on a picture the size of the demo', () => {
    const { nodes, edges } = cyclicFixture(24, 35);

    const cloned = clone(nodes, edges);
    const incumbentMeasurement = incumbent(nodes, edges);

    console.log(
      `24 cards, 35 relations — d3-dag (fast): ${cloned.ms.toFixed(1)} ms, ${cloned.overlaps} overlapping pairs, ${cloned.reversed} relations reversed · dagre: ${incumbentMeasurement.ms.toFixed(1)} ms, ${incumbentMeasurement.overlaps} overlapping pairs, ${incumbentMeasurement.reversed} relations reversed`
    );

    expect(cloned.overlaps).toBe(0);
    expect(cloned.reversed).toBeGreaterThan(0);
    expect(incumbentMeasurement.reversed).toBeGreaterThan(0);
  });

  it('is reproducible: the same picture comes out twice', () => {
    const { nodes, edges } = cyclicFixture(60, 120);

    const first = createDagLayout(nodes, edges);
    const second = createDagLayout(nodes, edges);

    expect(second.brokenRelations).toEqual(first.brokenRelations);

    for (const node of nodes) {
      expect(second.positions.get(node.id)).toEqual(first.positions.get(node.id));
    }
  });
});
