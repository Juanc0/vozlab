import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExplorationView from '$lib/components/ExplorationView.svelte';
import { EDGE, EDGE_C, NEW_NODE, NODE_A, NODE_B, NODE_C, RELATION_NAMES } from './fixtures/graph';
import { localeContext } from './harness/locale';
import { createFakeCore, fire } from './harness/cytoscape';

/**
 * Cytoscape needs a `<canvas>`, which jsdom does not provide. The module is
 * mocked instead: the point of the test is the **behaviour** of the view —
 * the preview, the badge and the layout — not the drawing.
 */
const { cytoscapeMock } = vi.hoisted(() => {
  const factory = vi.fn();
  return { cytoscapeMock: Object.assign(factory, { use: vi.fn() }) };
});

vi.mock('cytoscape', () => ({ default: cytoscapeMock }));

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));


describe('the exploration view', () => {
  let core: ReturnType<typeof createFakeCore>;

  beforeEach(() => {
    core = createFakeCore();
    cytoscapeMock.mockReset();
    cytoscapeMock.use.mockReset();
    cytoscapeMock.mockReturnValue(core.core);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function renderView(props: Record<string, unknown> = {}) {
    const result = render(ExplorationView, {
      context: localeContext(),
      props: {
        nodes: [NODE_A, NODE_B, NODE_C],
        edges: [EDGE, EDGE_C],
        ...props
      }
    });

    await waitFor(
      () => {
        expect(cytoscapeMock).toHaveBeenCalledTimes(1);
      },
      { timeout: 5000 }
    );

    return result;
  }

  it('draws the window on the canvas of the workspace', async () => {
    await renderView();

    expect(
      screen.getByRole('img', { name: 'Lienzo de la ventana de exploración' })
    ).toBeInTheDocument();
  });

  it('presents a node and centres on it', async () => {
    await renderView({
      nodes: [NODE_A, NODE_C, NEW_NODE],
      edges: [EDGE_C],
      presentedNodeId: NEW_NODE.id
    });

    // The node the view presents is expanded: it is a card the reader can
    // read from the picture itself.
    expect(
      screen.getByRole('button', { name: `Contraer «${NEW_NODE.title}»` })
    ).toBeInTheDocument();

    expect(core.core.center).toHaveBeenCalled();
  });

  it('shows only the neighbourhood of the focus when the reader asks for it', async () => {
    await renderView({
      nodes: [NODE_A, NODE_B, NODE_C],
      edges: [EDGE, EDGE_C],
      presentedNodeId: NODE_C.id,
      onlyNeighbourhood: true,
      depth: 0
    });

    // The picture is the neighbourhood of the focus: at depth zero it is
    // the focus alone.
    expect(core.nodes.has(NODE_A.id)).toBe(false);
    expect(core.nodes.has(NODE_C.id)).toBe(true);
  });

  it('opens a preview when the pointer is over a node and closes it when it leaves', async () => {
    await renderView();

    expect(screen.queryByRole('status')).toBeNull();

    fire(core.handlers, 'mouseover', 'node', {
      target: { id: () => NODE_A.id, isChild: () => false, data: () => undefined },
      renderedPosition: { x: 12, y: 24 }
    });

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
    expect(screen.getByText(NODE_A.description ?? '')).toBeInTheDocument();
    expect(screen.getByText('runbook')).toBeInTheDocument();

    fire(core.handlers, 'mouseout', 'node', { target: { id: () => NODE_A.id } });

    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
    });
  });

  it('opens a preview when the pointer is over a relation', async () => {
    await renderView();

    fire(core.handlers, 'mouseover', 'edge', {
      target: { id: () => EDGE.id, data: () => undefined },
      renderedPosition: { x: 12, y: 24 }
    });

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
    expect(screen.getByText(RELATION_NAMES.SUGGESTS.es)).toBeInTheDocument();
    expect(screen.getByText(`De «${NODE_A.title}» a «${NODE_B.title}»`)).toBeInTheDocument();
  });

  it('shows the content of the relation in the preview, without asking for it', async () => {
    await renderView();

    fire(core.handlers, 'mouseover', 'edge', {
      target: { id: () => EDGE.id, data: () => undefined },
      renderedPosition: { x: 12, y: 24 }
    });

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    // The window carries the content of the relation: the preview shows the
    // attributes, the author and the date.
    expect(screen.getByText('weight')).toBeInTheDocument();
    expect(screen.getByText('3', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText(/Autoría:/)).toBeInTheDocument();
    expect(screen.getByText(/Creado:/)).toBeInTheDocument();
  });

  it('expands a relation when its badge is clicked, and draws its card', async () => {
    await renderView();

    const badge = screen.getByRole('button', {
      name: `Expandir la relación «${RELATION_NAMES.SUGGESTS.es}»`
    });

    expect(badge).toHaveAttribute('aria-pressed', 'false');

    await fireEvent.click(badge);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: `Contraer la relación «${RELATION_NAMES.SUGGESTS.es}»` })
      ).toHaveAttribute('aria-pressed', 'true');
    });

    // The card of the relation is an element of the picture: it carries the
    // name of the relation and the content of it.
    const card = core.nodes.get(`${EDGE.id}#card`);

    expect(card).toBeDefined();
    expect(card?.data['label']).toBe(RELATION_NAMES.SUGGESTS.es);

    const body = core.nodes.get(`${EDGE.id}#body`);

    expect(String(body?.data['label'])).toContain('weight: 3');
    expect(String(body?.data['label'])).toContain('Autoría:');
  });

  it('expands a node when its badge is clicked, and the layout runs again', async () => {
    await renderView();

    const before = core.layouts.length;
    const badge = screen.getByRole('button', { name: `Expandir «${NODE_C.title}»` });

    expect(badge).toHaveAttribute('aria-pressed', 'false');

    await fireEvent.click(badge);

    await waitFor(() => {
      expect(core.layouts.length).toBeGreaterThan(before);
    });

    expect(
      screen.getByRole('button', { name: `Contraer «${NODE_C.title}»` })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the place a dragged node was put when the layout runs again', async () => {
    await renderView();

    fire(core.handlers, 'dragfree', 'node', {
      target: {
        id: () => NODE_C.id,
        isChild: () => false,
        data: () => undefined,
        position: () => ({ x: 300, y: 400 })
      }
    });

    const before = core.layouts.length;
    await fireEvent.click(screen.getByRole('button', { name: `Expandir «${NODE_C.title}»` }));

    await waitFor(() => {
      expect(core.layouts.length).toBeGreaterThan(before);
    });

    // The layout moves every node: the place the user dragged the node to
    // is put back after it.
    expect(core.nodes.get(NODE_C.id)?.position).toEqual({ x: 300, y: 400 });
  });

  it('draws the relations with the shape the view is given', async () => {
    await renderView({ edgeStyle: 'straight' });

    await waitFor(() => {
      expect(core.edges.get(EDGE.id)?.style['curve-style']).toBe('straight');
    });
  });

  it('routes the relations with right angles when the orthogonal shape is chosen', async () => {
    await renderView({ edgeStyle: 'orthogonal' });

    await waitFor(() => {
      expect(core.edges.get(EDGE.id)?.style['curve-style']).toBe('taxi');
    });
    expect(core.edges.get(EDGE.id)?.style['taxi-direction']).toBeTypeOf('string');
  });
});
