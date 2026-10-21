/**
 * The walk: clicking a node re-roots the view and re-centres it.
 *
 * The exploration view walks the graph: a click on a node asks the API for
 * the subgraph rooted at that node, at the depth that is selected, and the
 * answer is **merged** into the working set — what has been seen is never
 * lost.
 *
 * The tests drive the real page (the route of the graph) with a stubbed
 * API: what matters is the request that leaves the app, the picture that
 * stays on screen while it is on its way and the failure that does not
 * empty it.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '$lib/api/client';
import {
  API_CLIENT_CONTEXT_KEY,
  SESSION_CONTEXT_KEY,
  WORKSPACE_CONTEXT_KEY
} from '$lib/state/context';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import { EDGE, EDGE_B, NODE_A, NODE_B, NODE_C, WORKSPACE_ID } from './fixtures/graph';
import { ONTOLOGY } from './fixtures/ontology';
import { createFakeCore, fire, nodeTarget } from './harness/cytoscape';
import { contextWithLocale } from './harness/locale';
import Home from '../src/routes/(app)/+page.svelte';

const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto }));

const { pageState } = vi.hoisted(() => ({
  pageState: { url: new URL('http://localhost:5173/') }
}));
vi.mock('$app/state', () => ({ page: pageState }));

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

/** Cytoscape needs a `<canvas>`; jsdom has none. The module is mocked. */
const { cytoscapeMock } = vi.hoisted(() => {
  const factory = vi.fn();
  return { cytoscapeMock: Object.assign(factory, { use: vi.fn() }) };
});

vi.mock('cytoscape', () => ({ default: cytoscapeMock }));

const BASE_URL = 'http://localhost:3000/api/v1';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

interface Answers {
  /** The window of the exploration view. */
  window?: () => Response | Promise<Response>;
  /** The subgraph of a walk — one answer per call. */
  subgraph?: (call: number) => Response | Promise<Response>;
}

function stubFetch(answers: Answers): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes('/nodes/subgraph')) {
      const call = fetchMock.mock.calls.filter((entry) => String(entry[0]).includes('/nodes/subgraph'))
        .length;

      if (!answers.subgraph) {
        throw new Error(`unexpected request: ${url}`);
      }

      return answers.subgraph(call);
    }

    if (url.includes('/nodes/window')) {
      if (!answers.window) {
        throw new Error(`unexpected request: ${url}`);
      }

      return answers.window();
    }

    if (url.includes('/ontology')) {
      return json(ONTOLOGY);
    }

    if (url.includes('/proposals')) {
      return json({ proposals: [], nextCursor: null });
    }

    if (url.includes('/nodes')) {
      return json({ nodes: [NODE_A, NODE_B], nextCursor: null });
    }

    throw new Error(`unexpected request: ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage(): void {
  const session = new SessionState();
  const workspace = new WorkspaceState();
  workspace.hydrate([{ id: WORKSPACE_ID, slug: 'general', name: 'General', role: 'MEMBER' }]);
  workspace.setWorkspace(WORKSPACE_ID);

  const client = new ApiClient({ baseUrl: BASE_URL, session, workspace });

  render(Home, {
    props: { params: {}, data: { apiBaseUrl: BASE_URL, locale: 'es' } },
    context: contextWithLocale([
      [SESSION_CONTEXT_KEY, session],
      [WORKSPACE_CONTEXT_KEY, workspace],
      [API_CLIENT_CONTEXT_KEY, client]
    ])
  });
}

/** The calls the stub received for a path. */
function callsTo(fetchMock: ReturnType<typeof vi.fn>, path: string): string[] {
  return fetchMock.mock.calls
    .map((entry) => String(entry[0]))
    .filter((url) => url.includes(path));
}

describe('walking the graph by clicking a node', () => {
  let core: ReturnType<typeof createFakeCore>;

  beforeEach(() => {
    core = createFakeCore();
    cytoscapeMock.mockReset();
    cytoscapeMock.use.mockReset();
    cytoscapeMock.mockReturnValue(core.core);
    sessionStorage.clear();
    goto.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Opens the exploration view and waits for the window and the canvas. */
  async function openExploration(): Promise<void> {
    renderPage();

    await fireEvent.click(screen.getByRole('radio', { name: 'Explorar' }));

    await waitFor(
      () => {
        expect(
          screen.getByRole('img', { name: 'Lienzo de la ventana de exploración' })
        ).toBeInTheDocument();
        // The instance is created asynchronously: the tap needs it.
        expect(cytoscapeMock).toHaveBeenCalled();
      },
      { timeout: 5000 }
    );
  }

  it('asks the API for the subgraph of the clicked node, at the selected depth', async () => {
    const fetchMock = stubFetch({
      window: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] }),
      subgraph: () => json({ nodes: [NODE_B, NODE_C], edges: [EDGE_B] })
    });

    await openExploration();

    const windowsBefore = callsTo(fetchMock, '/nodes/window').length;

    // The user clicks a node of the picture.
    fire(core.handlers, 'tap', 'node', nodeTarget(NODE_C.id));

    await waitFor(() => {
      expect(callsTo(fetchMock, '/nodes/subgraph')).toHaveLength(1);
    });

    const call = callsTo(fetchMock, '/nodes/subgraph')[0] ?? '';

    expect(call).toContain(`rootId=${NODE_C.id}`);
    expect(call).toContain('depth=1');

    // The click is not a re-read of the window: it is a walk.
    expect(callsTo(fetchMock, '/nodes/window')).toHaveLength(windowsBefore);
  });

  it('merges the answer into the working set: what was seen is still there', async () => {
    stubFetch({
      window: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] }),
      subgraph: () => json({ nodes: [NODE_B, NODE_C], edges: [EDGE_B] })
    });

    await openExploration();

    fire(core.handlers, 'tap', 'node', nodeTarget(NODE_C.id));

    await waitFor(() => {
      const [nodeTable] = screen.getAllByRole('table');

      // The node that was in the window is still in the picture…
      expect(within(nodeTable).getByRole('button', { name: NODE_A.title })).toBeInTheDocument();
      // …and the node that was walked to joined it.
      expect(within(nodeTable).getByRole('button', { name: NODE_C.title })).toBeInTheDocument();
    });

    const [nodeTable, relationTable] = screen.getAllByRole('table');

    expect(within(nodeTable).getAllByRole('row')).toHaveLength(4);
    expect(within(relationTable).getAllByRole('row')).toHaveLength(3);
  });

  it('keeps the picture on screen while the answer is on its way', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    stubFetch({
      window: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] }),
      subgraph: async () => {
        await gate;
        return json({ nodes: [NODE_B, NODE_C], edges: [EDGE_B] });
      }
    });

    await openExploration();

    fire(core.handlers, 'tap', 'node', nodeTarget(NODE_C.id));

    // The walk is on its way: the picture is still the one of the window.
    await waitFor(() => {
      expect(screen.getByText(/Recuperando el entorno/)).toBeInTheDocument();
    });

    const [nodeTable] = screen.getAllByRole('table');

    expect(within(nodeTable).getByRole('button', { name: NODE_A.title })).toBeInTheDocument();
    expect(within(nodeTable).getByRole('button', { name: NODE_B.title })).toBeInTheDocument();

    release?.();

    await waitFor(() => {
      expect(within(nodeTable).getByRole('button', { name: NODE_C.title })).toBeInTheDocument();
    });
  });

  it('keeps the picture and shows the code and the message when the walk fails', async () => {
    stubFetch({
      window: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] }),
      subgraph: () =>
        json({ code: 'ERR_NODE_NOT_FOUND', message: 'Node not found' }, 404)
    });

    await openExploration();

    fire(core.handlers, 'tap', 'node', nodeTarget(NODE_C.id));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('ERR_NODE_NOT_FOUND');
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Node not found');

    // The picture is still there: the error is shown next to it.
    const [nodeTable] = screen.getAllByRole('table');

    expect(within(nodeTable).getByRole('button', { name: NODE_A.title })).toBeInTheDocument();
  });

  it('says that a node without relations is not a failure', async () => {
    stubFetch({
      window: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] }),
      subgraph: () => json({ nodes: [NODE_C], edges: [] })
    });

    await openExploration();

    fire(core.handlers, 'tap', 'node', nodeTarget(NODE_C.id));

    await waitFor(() => {
      expect(screen.getByText(/no tiene relaciones/)).toBeInTheDocument();
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('switches the criterion of the focus to the one the user picked', async () => {
    stubFetch({
      window: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] }),
      subgraph: () => json({ nodes: [NODE_B, NODE_C], edges: [EDGE_B] })
    });

    await openExploration();

    // The criterion starts on the most recent node.
    expect(screen.getByRole('radio', { name: 'El más reciente' })).toBeChecked();

    fire(core.handlers, 'tap', 'node', nodeTarget(NODE_C.id));

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'El elegido a mano' })).toBeChecked();
    });

    // And the control says which one is in force.
    expect(screen.getByText('Criterio activo: El elegido a mano.')).toBeInTheDocument();
  });

  it('centres the picture on the node the user walked to', async () => {
    stubFetch({
      window: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] }),
      subgraph: () => json({ nodes: [NODE_B, NODE_C], edges: [EDGE_B] })
    });

    await openExploration();

    fire(core.handlers, 'tap', 'node', nodeTarget(NODE_C.id));

    await waitFor(() => {
      const centred = (core.core['center'] as ReturnType<typeof vi.fn>).mock.calls;

      expect(
        centred.some((call) => {
          const element = call[0] as { id?: () => string } | undefined;

          return element?.id?.() === NODE_C.id;
        })
      ).toBe(true);
    });
  });

  it('hides the far nodes when the reader asks for it, and the count is the truth', async () => {
    stubFetch({
      window: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] }),
      subgraph: () => json({ nodes: [NODE_B, NODE_C], edges: [EDGE_B] })
    });

    await openExploration();

    fire(core.handlers, 'tap', 'node', nodeTarget(NODE_C.id));

    await waitFor(() => {
      expect(screen.getByText('La imagen tiene 3 nodos: todo lo que se ha visto.')).toBeInTheDocument();
    });

    // The switch is off: the picture is the whole working set.
    const toggle = screen.getByRole('checkbox', { name: 'Solo el entorno del nodo' });

    expect(toggle).not.toBeChecked();

    await fireEvent.click(toggle);

    // The focus is the node that was clicked: at depth 1 its neighbourhood
    // is the node itself and its one neighbour — and the count says so.
    await waitFor(() => {
      expect(
        screen.getByText('La imagen tiene 2 nodos; 1 quedan fuera del entorno del nodo presentado.')
      ).toBeInTheDocument();
    });

    const [nodeTable] = screen.getAllByRole('table');

    expect(within(nodeTable).queryByRole('button', { name: NODE_A.title })).toBeNull();
    expect(within(nodeTable).getByRole('button', { name: NODE_C.title })).toBeInTheDocument();
  });

  it('walks with the depth that is selected', async () => {
    const fetchMock = stubFetch({
      window: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] }),
      subgraph: () => json({ nodes: [NODE_B, NODE_C], edges: [EDGE_B] })
    });

    await openExploration();

    // The depth of the exploration view is the depth of the whole app.
    await fireEvent.change(screen.getByLabelText('Profundidad', { selector: '#explore-depth' }), {
      target: { value: '2' }
    });

    fire(core.handlers, 'tap', 'node', nodeTarget(NODE_C.id));

    await waitFor(() => {
      expect(callsTo(fetchMock, '/nodes/subgraph')).toHaveLength(1);
    });

    expect(callsTo(fetchMock, '/nodes/subgraph')[0]).toContain('depth=2');
  });

  it('walks from the list too: it is the way a keyboard reaches the picture', async () => {
    const fetchMock = stubFetch({
      window: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] }),
      subgraph: () => json({ nodes: [NODE_B, NODE_C], edges: [EDGE_B] })
    });

    await openExploration();

    const [nodeTable] = screen.getAllByRole('table');
    const walk = within(nodeTable).getAllByRole('button', { name: 'Caminar' })[1];

    await fireEvent.click(walk);

    await waitFor(() => {
      expect(callsTo(fetchMock, '/nodes/subgraph')).toHaveLength(1);
    });

    expect(callsTo(fetchMock, '/nodes/subgraph')[0]).toContain(`rootId=${NODE_B.id}`);

    // The walk is a choice of the user: the criterion follows it.
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'El elegido a mano' })).toBeChecked();
    });
  });

  it('re-roots the subgraph of the other view when a node is clicked', async () => {
    const fetchMock = stubFetch({
      window: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] }),
      subgraph: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] })
    });

    renderPage();

    // The root picker draws a subgraph.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: NODE_A.title })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: NODE_A.title }));

    await waitFor(
      () => {
        expect(callsTo(fetchMock, '/nodes/subgraph')).toHaveLength(1);
        // The instance is created asynchronously: the tap needs it.
        expect(cytoscapeMock).toHaveBeenCalled();
      },
      { timeout: 5000 }
    );

    // The user clicks a node of the subgraph: it becomes the root.
    fire(core.handlers, 'tap', 'node', nodeTarget(NODE_B.id));

    await waitFor(() => {
      expect(callsTo(fetchMock, '/nodes/subgraph')).toHaveLength(2);
    });

    const call = callsTo(fetchMock, '/nodes/subgraph')[1] ?? '';

    expect(call).toContain(`rootId=${NODE_B.id}`);

    // The picture is centred on the node the reader walked to.
    await waitFor(() => {
      const centred = (core.core['center'] as ReturnType<typeof vi.fn>).mock.calls;

      expect(
        centred.some((entry) => {
          const element = entry[0] as { id?: () => string } | undefined;

          return element?.id?.() === NODE_B.id;
        })
      ).toBe(true);
    });
  });
});
