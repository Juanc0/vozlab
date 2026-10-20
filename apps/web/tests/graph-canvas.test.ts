import { render, screen, waitFor, within } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GraphCanvas from '$lib/components/GraphCanvas.svelte';
import GraphHarness from './harness/GraphHarness.svelte';
import { EDGE, NODE_A, NODE_B } from './fixtures/graph';

/**
 * Cytoscape needs a `<canvas>`, which jsdom does not provide. The module is
 * mocked instead: the point of the test is the **lifecycle** of the canvas,
 * not the drawing.
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

interface FakeCore {
  on: ReturnType<typeof vi.fn>;
  elements: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  layout: ReturnType<typeof vi.fn>;
  nodes: ReturnType<typeof vi.fn>;
  getElementById: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

function createFakeCore(): FakeCore {
  const collection = () => ({
    length: 0,
    addClass: vi.fn(),
    removeClass: vi.fn(),
    remove: vi.fn()
  });

  return {
    on: vi.fn(),
    elements: vi.fn(() => collection()),
    add: vi.fn(),
    layout: vi.fn(() => ({ run: vi.fn() })),
    nodes: vi.fn(() => collection()),
    getElementById: vi.fn(() => collection()),
    destroy: vi.fn()
  };
}

/** The handler the canvas registered for a tap on a node. */
function nodeTapHandler(core: FakeCore): (event: { target: { id: () => string } }) => void {
  const call = core.on.mock.calls.find((entry) => entry[1] === 'node');
  if (!call) {
    throw new Error('the canvas did not register a handler for the nodes');
  }
  return call[2] as (event: { target: { id: () => string } }) => void;
}

describe('the graph canvas', () => {
  let core: FakeCore;

  beforeEach(() => {
    core = createFakeCore();
    cytoscapeMock.mockReset();
    cytoscapeMock.use.mockReset();
    cytoscapeMock.mockReturnValue(core);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates the instance once and registers the dagre layout once', async () => {
    render(GraphCanvas, { props: { nodes: [NODE_A], edges: [] } });

    // The canvas is imported dynamically inside the effect, so the module
    // may take longer than the default one second of `waitFor` when the
    // machine is loaded.
    await waitFor(
      () => {
        expect(cytoscapeMock).toHaveBeenCalledTimes(1);
      },
      { timeout: 5000 }
    );

    expect(cytoscapeMock.use).toHaveBeenCalledTimes(1);
  });

  it('patches the elements when the data changes instead of re-creating the instance', async () => {
    const { rerender } = render(GraphCanvas, { props: { nodes: [NODE_A], edges: [] } });

    // The canvas is imported dynamically inside the effect, so the module
    // may take longer than the default one second of `waitFor` when the
    // machine is loaded.
    await waitFor(
      () => {
        expect(cytoscapeMock).toHaveBeenCalledTimes(1);
      },
      { timeout: 5000 }
    );

    await rerender({ nodes: [NODE_A, NODE_B], edges: [EDGE] });

    await waitFor(
      () => {
        expect(core.add).toHaveBeenCalled();
      },
      { timeout: 5000 }
    );

    // The instance survived: it was not re-created.
    expect(cytoscapeMock).toHaveBeenCalledTimes(1);
    expect(core.elements).toHaveBeenCalled();
  });

  it('destroys the instance when the canvas is unmounted', async () => {
    const { unmount } = render(GraphCanvas, { props: { nodes: [NODE_A], edges: [] } });

    // The canvas is imported dynamically inside the effect, so the module
    // may take longer than the default one second of `waitFor` when the
    // machine is loaded.
    await waitFor(
      () => {
        expect(cytoscapeMock).toHaveBeenCalledTimes(1);
      },
      { timeout: 5000 }
    );

    unmount();

    expect(core.destroy).toHaveBeenCalledTimes(1);
  });

  it('gives the canvas an accessible name and a description', async () => {
    render(GraphCanvas, {
      props: { nodes: [NODE_A], edges: [], description: 'Two nodes, one relation.' }
    });

    const canvas = screen.getByRole('img', { name: 'Subgraph canvas' });

    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAccessibleDescription('Two nodes, one relation.');
  });
});

describe('the canvas and the list view', () => {
  let core: FakeCore;

  beforeEach(() => {
    core = createFakeCore();
    cytoscapeMock.mockReset();
    cytoscapeMock.use.mockReset();
    cytoscapeMock.mockReturnValue(core);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects the node in the canvas when the list selects it', async () => {
    render(GraphHarness, { props: { nodes: [NODE_A, NODE_B], edges: [EDGE] } });

    // The canvas is imported dynamically inside the effect, so the module
    // may take longer than the default one second of `waitFor` when the
    // machine is loaded.
    await waitFor(
      () => {
        expect(cytoscapeMock).toHaveBeenCalledTimes(1);
      },
      { timeout: 5000 }
    );

    const [nodeTable] = screen.getAllByRole('table');
    await fireEvent.click(within(nodeTable).getByRole('button', { name: NODE_B.title }));

    await waitFor(() => {
      expect(core.getElementById).toHaveBeenCalledWith(NODE_B.id);
    });
  });

  it('marks the node in the list when the canvas selects it', async () => {
    render(GraphHarness, { props: { nodes: [NODE_A, NODE_B], edges: [EDGE] } });

    // The canvas is imported dynamically inside the effect, so the module
    // may take longer than the default one second of `waitFor` when the
    // machine is loaded.
    await waitFor(
      () => {
        expect(cytoscapeMock).toHaveBeenCalledTimes(1);
      },
      { timeout: 5000 }
    );

    nodeTapHandler(core)({ target: { id: () => NODE_A.id } });

    await waitFor(() => {
      const [nodeTable] = screen.getAllByRole('table');
      expect(within(nodeTable).getByRole('button', { name: NODE_A.title })).toHaveAttribute(
        'aria-current',
        'true'
      );
    });
  });
});
