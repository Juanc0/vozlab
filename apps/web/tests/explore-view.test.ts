import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExplorationView from '$lib/components/ExplorationView.svelte';
import { EDGE, EDGE_C, NEW_NODE, NODE_A, NODE_B, NODE_C } from './fixtures/graph';
import { localeContext } from './harness/locale';

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

interface FakeNode {
  kind: 'node';
  id: string;
  data: Record<string, unknown>;
  classes: Set<string>;
  style: Record<string, unknown>;
  position: { x: number; y: number };
  api: Record<string, unknown>;
}

interface FakeEdge {
  kind: 'edge';
  id: string;
  data: Record<string, unknown>;
  classes: Set<string>;
  style: Record<string, unknown>;
  sourceId: string;
  targetId: string;
  api: Record<string, unknown>;
}

interface Handler {
  event: string;
  selector: string | null;
  handler: (event: unknown) => void;
}

function createFakeCore() {
  const nodes = new Map<string, FakeNode>();
  const edges = new Map<string, FakeEdge>();
  const handlers: Handler[] = [];
  const layouts: Array<Record<string, unknown>> = [];
  let placed = 0;

  const nodeApi = (node: FakeNode) => ({
    id: () => node.id,
    data: (key: string) => node.data[key],
    // The text of a card is a child of the card: it hangs under it.
    isChild: () => node.data['parent'] !== undefined,
    parent: () => {
      const parentId = node.data['parent'];

      if (typeof parentId !== 'string') {
        return collection([]);
      }

      const parent = nodes.get(parentId);

      return parent === undefined ? collection([]) : collection([parent]);
    },
    hasClass: (name: string) => node.classes.has(name),
    // The text of a card is not a thing the user can move.
    ungrabify: vi.fn(),
    // The position can be read and written: the instance puts the places
    // the user dragged back after the layout.
    position: (next?: { x: number; y: number }) => {
      if (next !== undefined) {
        node.position = next;
      }

      return node.position;
    },
    outerWidth: () => 40,
    outerHeight: () => 40,
    renderedPosition: () => ({ x: 30, y: 40 }),
    renderedWidth: () => 40,
    renderedHeight: () => 40,
    style: (properties: Record<string, unknown>) => {
      Object.assign(node.style, properties);
    },
    addClass: (name: string) => {
      node.classes.add(name);
    },
    removeClass: (name: string) => {
      node.classes.delete(name);
    }
  });

  const edgeApi = (edge: FakeEdge) => ({
    id: () => edge.id,
    source: () => (nodes.get(edge.sourceId) as FakeNode).api,
    target: () => (nodes.get(edge.targetId) as FakeNode).api,
    style: (properties: Record<string, unknown>) => {
      Object.assign(edge.style, properties);
    },
    addClass: (name: string) => {
      edge.classes.add(name);
    },
    removeClass: (name: string) => {
      edge.classes.delete(name);
    }
  });

  const collection = (items: Array<FakeNode | FakeEdge>) => ({
    get length() {
      return items.length;
    },
    items,
    forEach: (fn: (item: unknown) => void) => {
      items.forEach((item) => fn(item.api));
    },
    map: (fn: (item: unknown) => unknown) => items.map((item) => fn(item.api)),
    // The collection knows the nodes it holds and can be narrowed: the
    // layout arranges the cards, not the text that hangs under them.
    nodes: () => collection(items.filter((item) => item.kind === 'node')),
    filter: (fn: (item: unknown) => boolean) => collection(items.filter((item) => fn(item.api))),
    union: (other: { items: Array<FakeNode | FakeEdge> }) =>
      collection([...items, ...other.items]),
    remove: () => {
      for (const item of items) {
        if (item.kind === 'node') {
          nodes.delete(item.id);
        } else {
          edges.delete(item.id);
        }
      }
    },
    removeClass: (name: string) => {
      items.forEach((item) => item.classes.delete(name));
    },
    addClass: (name: string) => {
      items.forEach((item) => item.classes.add(name));
    }
  });

  const core = {
    on: (
      event: string,
      selector: string | ((event: unknown) => void) | undefined,
      handler?: (event: unknown) => void
    ) => {
      handlers.push({
        event,
        selector: typeof selector === 'string' ? selector : null,
        handler: handler ?? (selector as (event: unknown) => void)
      });
    },
    elements: () => collection([...nodes.values(), ...edges.values()]),
    add: (
      added: Array<{
        group: string;
        data: { id: string; source?: string; target?: string };
        classes?: string[];
      }>
    ) => {
      for (const element of added) {
        if (element.group === 'nodes') {
          const node: FakeNode = {
            kind: 'node',
            id: element.data.id,
            data: element.data,
            classes: new Set(element.classes ?? []),
            style: {},
            // The nodes are spread over the picture: the mock has to draw a
            // graph whose nodes are not on top of each other.
            position: { x: (placed % 5) * 160, y: Math.floor(placed / 5) * 140 },
            api: {}
          };
          placed += 1;
          node.api = nodeApi(node);
          nodes.set(element.data.id, node);
        } else {
          const edge: FakeEdge = {
            kind: 'edge',
            id: element.data.id,
            data: element.data,
            classes: new Set(),
            style: {},
            sourceId: element.data.source ?? '',
            targetId: element.data.target ?? '',
            api: {}
          };
          edge.api = edgeApi(edge);
          edges.set(element.data.id, edge);
        }
      }
    },
    layout: (options: Record<string, unknown>) => {
      layouts.push(options);
      return { run: () => undefined };
    },
    nodes: () => collection([...nodes.values()]),
    edges: () => collection([...edges.values()]),
    getElementById: (id: string) => {
      const node = nodes.get(id);

      if (node === undefined) {
        return { length: 0, addClass: () => undefined };
      }

      return { length: 1, ...nodeApi(node) };
    },    center: vi.fn(),
    fit: vi.fn(),
    zoom: vi.fn(() => 1),
    destroy: vi.fn()
  };

  return { core, handlers, layouts, nodes, edges };
}

/** Fires the handler the instance registered for an event. */
function fire(
  handlers: Handler[],
  event: string,
  selector: string | null,
  payload: unknown
): void {
  const call = handlers.find(
    (entry) => entry.event === event && (selector === null || entry.selector === selector)
  );

  if (call === undefined) {
    throw new Error(`the canvas did not register a handler for ${event}`);
  }

  call.handler(payload);
}

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

  it('draws the window and says what the window is', async () => {
    await renderView();

    expect(screen.getByRole('img', { name: 'Lienzo de la ventana de exploración' })).toBeInTheDocument();
    expect(screen.getByText(/La ventana es un grafo/)).toBeInTheDocument();
    expect(screen.getByText(/El orden es de/)).toBeInTheDocument();
    expect(screen.getByText(/no tiene paginación/)).toBeInTheDocument();
  });

  it('presents a node and centres on it', async () => {
    await renderView({ nodes: [NODE_A, NODE_C, NEW_NODE], edges: [EDGE_C] });

    // The newest node of the window is the one that is presented.
    expect(screen.getByText(`Se presenta «${NEW_NODE.title}».`)).toBeInTheDocument();
    expect(core.core.center).toHaveBeenCalled();
  });

  it('changes the presented node when the criterion changes', async () => {
    await renderView({ nodes: [NODE_A, NODE_C, NEW_NODE], edges: [EDGE_C] });

    await fireEvent.click(screen.getByRole('radio', { name: 'El más relacionado' }));

    await waitFor(() => {
      expect(screen.getByText(`Se presenta «${NODE_A.title}».`)).toBeInTheDocument();
    });
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
    expect(screen.getByText(EDGE.relationKey)).toBeInTheDocument();
    expect(screen.getByText(`De «${NODE_A.title}» a «${NODE_B.title}»`)).toBeInTheDocument();
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

  it('draws the relations with the shape the user chooses', async () => {
    await renderView();

    await fireEvent.change(screen.getByLabelText('Forma de las flechas'), {
      target: { value: 'straight' }
    });

    await waitFor(() => {
      expect(core.edges.get(EDGE.id)?.style['curve-style']).toBe('straight');
    });
  });

  it('routes the relations with right angles when the orthogonal shape is chosen', async () => {
    await renderView();

    await fireEvent.change(screen.getByLabelText('Forma de las flechas'), {
      target: { value: 'orthogonal' }
    });

    await waitFor(() => {
      expect(core.edges.get(EDGE.id)?.style['curve-style']).toBe('taxi');
    });
    expect(core.edges.get(EDGE.id)?.style['taxi-direction']).toBeTypeOf('string');
  });
});
