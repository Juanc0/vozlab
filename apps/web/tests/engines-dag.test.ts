/**
 * The **clone of `dagre`** in the comparison of the engines.
 *
 * The clone is the layered arrangement of `d3-dag`, and the library is a
 * dependency of the **development surface** only: the comparison brings
 * the clone to the picture and the picture never imports it.
 *
 * The test says three things:
 *
 * - the comparison of the engines **hands the clone over** to the picture
 *   it mounts;
 * - the picture arranges itself with the clone and **reports the relations
 *   the clone reversed** — the number that the comparison shows;
 * - a picture that is asked for the clone and does not get one **says so**
 *   instead of arranging itself with something else.
 */

import { render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EnginePanel from '$lib/dev/engines/EnginePanel.svelte';
import { createDagLayout } from '$lib/dev/engines/dag';
import {
  createExplorationInstance,
  type ExplorationInstance,
  type LayoutReport
} from '$lib/graph/explore/instance';
import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
import { EDGE, EDGE_B, NODE_A, NODE_B, NODE_C } from './fixtures/graph';
import { createFakeCore, type FakeCore } from './harness/cytoscape';

/**
 * The canvas of Cytoscape is **stubbed**: the test is about the clone
 * that the comparison hands over, not about the drawing.
 */
vi.mock('../src/lib/components/ExplorationCanvas.svelte', async () => ({
  default: (await import('./fixtures/StubCytoscapeCanvas.svelte')).default
}));

/**
 * The panel of Sigma is **stubbed** as well: it draws with WebGL, and
 * jsdom has no WebGL.
 */
vi.mock('../src/lib/dev/engines/SigmaPanel.svelte', async () => ({
  default: (await import('./fixtures/StubSigmaPanel.svelte')).default
}));

/** Cytoscape needs a `<canvas>`; jsdom has none. The module is mocked. */
const { cytoscapeMock } = vi.hoisted(() => {
  const factory = vi.fn();

  return { cytoscapeMock: Object.assign(factory, { use: vi.fn() }) };
});

vi.mock('cytoscape', () => ({ default: cytoscapeMock }));

/** The relation that closes the cycle of the picture. */
const CLOSING_EDGE: SubgraphEdgeDto = {
  ...EDGE,
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  sourceNodeId: NODE_C.id,
  targetNodeId: NODE_A.id,
  relationKey: 'SOLVES'
};

/** The picture of the comparison: three cards and a cycle. */
const NODES: NodeDto[] = [NODE_A, NODE_B, NODE_C];
const EDGES: SubgraphEdgeDto[] = [EDGE, EDGE_B, CLOSING_EDGE];

describe('the comparison of the engines', () => {
  beforeEach(() => {
    cytoscapeMock.mockReset();
    cytoscapeMock.use.mockReset();
  });

  it('hands the clone over to the picture it mounts', async () => {
    render(EnginePanel, {
      props: {
        engine: 'dag',
        nodes: NODES,
        edges: EDGES,
        expandedIds: new Set<string>(),
        selectedNodeId: null,
        presentedNodeId: null,
        edgeStyle: 'bezier',
        label: 'El lienzo'
      }
    });

    // The canvas of the comparison received the clone: the library of the
    // development surface is here, and nowhere else.
    const canvas = screen.getByTestId('cytoscape-canvas');

    expect(canvas.getAttribute('data-layout')).toBe('dag');
    expect(canvas.getAttribute('data-dag-layout')).toBe('clone');
  });
});

describe('the picture arranged with the clone', () => {
  let core: FakeCore;
  let instance: ExplorationInstance;
  let reports: LayoutReport[];
  let errors: string[];

  /**
   * Creates the picture.
   *
   * @param clone - The clone the picture is given, or `null` for none.
   */
  function create(clone: typeof createDagLayout | null): void {
    core = createFakeCore();
    cytoscapeMock.mockReturnValue(core.core);

    reports = [];
    errors = [];

    instance = createExplorationInstance({
      container: document.createElement('div'),
      onselect: () => undefined,
      onselectedge: () => undefined,
      onpreview: () => undefined,
      ondrag: () => undefined,
      onrender: () => undefined,
      dagLayout: clone ?? undefined,
      onlayout: (report) => {
        reports.push(report);
      },
      onerror: (message) => {
        errors.push(message);
      }
    });
  }

  /**
   * Draws the picture with the clone.
   *
   * @param nodes - The nodes of the picture.
   * @param edges - The relations of the picture.
   */
  function draw(nodes: NodeDto[], edges: SubgraphEdgeDto[]): void {
    instance.setElements(nodes, edges, {
      expandedIds: new Set<string>(),
      expandedEdgeIds: new Set<string>(),
      edgeStyle: 'bezier',
      presentedNodeId: null,
      pinned: new Map(),
      layout: 'dag'
    });
  }

  afterEach(() => {
    instance?.destroy();
    vi.restoreAllMocks();
  });

  it('arranges the picture with the clone and reports the relations it reversed', () => {
    create(createDagLayout);

    draw(NODES, EDGES);

    const report = reports.at(-1);

    expect(report?.layout).toBe('dag');

    // The relation that closes the cycle is the one the clone had to
    // reverse: it is reported, and it is the relation the comparison shows.
    expect(report?.reversedRelations).toEqual([CLOSING_EDGE.id]);

    // The picture was arranged: the cards were put in their places.
    expect(core.placements.length).toBeGreaterThan(0);
  });

  it('says so when it is asked for the clone and does not get one', () => {
    create(null);

    draw(NODES, EDGES);

    expect(errors).toHaveLength(1);
    expect(reports).toHaveLength(0);
  });
});
