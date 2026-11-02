/**
 * The three panels of the comparison get the **same** data.
 *
 * The comparison is only worth anything if the three pictures are the same
 * picture: the same nodes, the same relations and the same ids. The test
 * builds the picture once and asks the two engines for their elements.
 */

import Graph from 'graphology';
import { describe, expect, it } from 'vitest';
import { toGraphElements } from '$lib/graph/elements';
import { comparisonGraph, edgeIds, nodeIds, syntheticNodes } from '$lib/dev/engines/comparison-data';
import { fillSigmaGraph } from '$lib/dev/engines/sigma-graph';
import { EDGE, EDGE_B, NODE_A, NODE_B, NODE_C } from './fixtures/graph';

const DEMO = {
  nodes: [NODE_A, NODE_B, NODE_C],
  edges: [EDGE, EDGE_B]
};

describe('the data of the comparison', () => {
  it('gives the three engines the same ids', () => {
    const picture = comparisonGraph(DEMO, 200);

    // The picture of the two engines of Cytoscape: the cards of the nodes
    // and the relations among them.
    const elements = toGraphElements(picture.nodes, picture.edges);
    const cytoscapeNodes = elements
      .filter((element) => element.group === 'nodes' && !element.data.id.includes('#'))
      .map((element) => element.data.id);
    const cytoscapeEdges = elements
      .filter((element) => element.group === 'edges')
      .map((element) => element.data.id);

    // The picture of Sigma: the graph of Graphology.
    const store = new Graph();
    fillSigmaGraph(store, picture.nodes, picture.edges);

    expect(store.nodes().length).toBe(picture.nodes.length);
    expect(store.edges().length).toBe(picture.edges.length);

    for (const id of nodeIds(picture)) {
      expect(store.hasNode(id)).toBe(true);
      expect(cytoscapeNodes).toContain(id);
    }

    for (const id of edgeIds(picture)) {
      expect(store.hasEdge(id)).toBe(true);
      expect(cytoscapeEdges).toContain(id);
    }
  });

  it('keeps the real nodes and adds the synthetic ones until the ceiling', () => {
    const picture = comparisonGraph(DEMO, 200);

    expect(picture.nodes.length).toBe(200);
    // The three real nodes are still there, with their ids.
    expect(picture.nodes.slice(0, 3).map((node) => node.id)).toEqual([
      NODE_A.id,
      NODE_B.id,
      NODE_C.id
    ]);
  });

  it('builds the same synthetic picture every time', () => {
    const first = syntheticNodes(12, DEMO.nodes);
    const second = syntheticNodes(12, DEMO.nodes);

    expect(first.nodes.map((node) => node.id)).toEqual(second.nodes.map((node) => node.id));
    expect(first.nodes.map((node) => node.title)).toEqual(
      second.nodes.map((node) => node.title)
    );
    expect(first.edges.map((edge) => edge.id)).toEqual(second.edges.map((edge) => edge.id));
  });

  it('never repeats an id', () => {
    const picture = comparisonGraph(DEMO, 200);
    const ids = nodeIds(picture);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries a long word in a title, so the card has to grow', () => {
    const { nodes } = syntheticNodes(20, DEMO.nodes);

    expect(nodes.some((node) => node.title.includes('Estacionamiento'))).toBe(true);
  });
});
