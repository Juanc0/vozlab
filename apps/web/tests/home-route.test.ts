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
import { EDGE, NEW_NODE, NODE_A, NODE_B, RELATION_NAMES, WORKSPACE_ID } from './fixtures/graph';
import { EDGE_DTO } from './fixtures/inspector';
import { ONTOLOGY } from './fixtures/ontology';
import Home from '../src/routes/(app)/+page.svelte';
import { contextWithLocale } from './harness/locale';

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
  nodes?: () => Response | Promise<Response>;
  subgraph?: (call: number) => Response | Promise<Response>;
  proposals?: () => Response | Promise<Response>;
  ontology?: () => Response | Promise<Response>;
  createNode?: () => Response | Promise<Response>;
  getNode?: () => Response | Promise<Response>;
  createEdge?: () => Response | Promise<Response>;
  /** The relation the inspector reads with `GET /api/v1/edges/:id`. */
  edge?: () => Response | Promise<Response>;
}

function stubFetch(answers: Answers): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.includes('/nodes/subgraph')) {
      const call = fetchMock.mock.calls.filter((entry) => String(entry[0]).includes('/nodes/subgraph'))
        .length;
      if (!answers.subgraph) throw new Error(`unexpected request: ${url}`);
      return answers.subgraph(call);
    }

    if (url.includes('/proposals')) {
      if (!answers.proposals) throw new Error(`unexpected request: ${url}`);
      return answers.proposals();
    }

    if (url.includes('/ontology')) {
      // The metamodel drives the creation forms; the fixture is the active
      // ontology of the dev seed.
      return answers.ontology ? answers.ontology() : json(ONTOLOGY);
    }

    if (/\/nodes\/[0-9a-f-]{36}$/.test(url)) {
      if (!answers.getNode) throw new Error(`unexpected request: ${url}`);
      return answers.getNode();
    }

    if (/\/edges\/[0-9a-f-]{36}$/.test(url)) {
      if (!answers.edge) throw new Error(`unexpected request: ${url}`);
      return answers.edge();
    }

    if (url.includes('/nodes')) {
      if (method === 'POST') {
        if (!answers.createNode) throw new Error(`unexpected request: ${url}`);
        return answers.createNode();
      }
      if (!answers.nodes) throw new Error(`unexpected request: ${url}`);
      return answers.nodes();
    }

    if (url.includes('/edges')) {
      if (!answers.createEdge) throw new Error(`unexpected request: ${url}`);
      return answers.createEdge();
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

/**
 * Opens the **list** — the text alternative of the canvas.
 *
 * The list is the other half of the workspace: the toggle of the toolbar
 * swaps the picture and the list, and both carry the same working set and
 * the same selection.
 */
async function openList(): Promise<void> {
  await fireEvent.click(screen.getByRole('button', { name: 'Lista' }));

  await waitFor(() => {
    expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
  });
}

describe('the graph page', () => {
  beforeEach(() => {
    sessionStorage.clear();
    goto.mockClear();
    cytoscapeMock.mockReset();
    cytoscapeMock.use.mockReset();
    cytoscapeMock.mockReturnValue({
      on: vi.fn(),
      elements: vi.fn(() => ({ length: 0, remove: vi.fn() })),
      add: vi.fn(),
      layout: vi.fn(() => ({ run: vi.fn(), one: vi.fn() })),
      nodes: vi.fn(() => ({ length: 0, removeClass: vi.fn() })),
      getElementById: vi.fn(() => ({ length: 0, addClass: vi.fn() })),
      destroy: vi.fn()
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lists the newest nodes of the workspace as the root picker', async () => {
    stubFetch({
      nodes: () => json({ nodes: [NODE_A, NODE_B], nextCursor: null })
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: NODE_A.title })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: NODE_B.title })).toBeInTheDocument();
  });

  it('says so when the workspace holds no node', async () => {
    stubFetch({ nodes: () => json({ nodes: [], nextCursor: null }) });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/todavía no tiene ningún nodo/i)).toBeInTheDocument();
    });
  });

  it('draws the subgraph of the picked root', async () => {
    const fetchMock = stubFetch({
      nodes: () => json({ nodes: [NODE_A, NODE_B], nextCursor: null }),
      subgraph: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] }),
      proposals: () => json({ proposals: [], nextCursor: null })
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: NODE_A.title })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: NODE_A.title }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((entry) => String(entry[0]).includes('/nodes/subgraph'));
      expect(call).toBeDefined();
    });

    // The window the API was asked for is the bounded one.
    const subgraphCall = fetchMock.mock.calls.find((entry) =>
      String(entry[0]).includes('/nodes/subgraph')
    );
    expect(String(subgraphCall?.[0])).toContain(`rootId=${NODE_A.id}`);
    expect(String(subgraphCall?.[0])).toContain('depth=1');
    expect(String(subgraphCall?.[0])).toContain('limit=100');

    // The list view shows the whole subgraph — it is one click away.
    await openList();

    const nodeTable = screen.getAllByRole('table')[0];
    expect(within(nodeTable).getByRole('button', { name: NODE_B.title })).toBeInTheDocument();
  });

  it('keeps the graph on the canvas when a reload fails', async () => {
    stubFetch({
      nodes: () => json({ nodes: [NODE_A, NODE_B], nextCursor: null }),
      subgraph: (call) =>
        call === 1
          ? json({ nodes: [NODE_A, NODE_B], edges: [EDGE] })
          : json({ code: 'ERR_NODE_NOT_FOUND', message: 'Node not found' }, 404),
      proposals: () => json({ proposals: [], nextCursor: null })
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: NODE_A.title })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: NODE_A.title }));

    await openList();

    const nodeTable = screen.getAllByRole('table')[0];
    expect(within(nodeTable).getByRole('button', { name: NODE_B.title })).toBeInTheDocument();

    // A deeper window fails: the error is shown and the graph stays.
    await fireEvent.change(screen.getByLabelText('Profundidad'), { target: { value: '2' } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('ERR_NODE_NOT_FOUND');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Node not found');

    // The graph stays on the canvas: the error is shown next to it.
    expect(within(screen.getAllByRole('table')[0]).getByRole('button', { name: NODE_B.title })).toBeInTheDocument();
  });

  it('does not imply a live update stream', async () => {
    stubFetch({ nodes: () => json({ nodes: [], nextCursor: null }) });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Grafo' })).toBeInTheDocument();
    });

    expect(screen.queryByText(/live/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/realtime/i)).not.toBeInTheDocument();
  });

  it('opens the node form from the toolbar', async () => {
    stubFetch({ nodes: () => json({ nodes: [NODE_A, NODE_B], nextCursor: null }) });

    renderPage();

    const button = screen.getByRole('button', { name: 'Nuevo nodo' });
    await waitFor(() => {
      expect(button).toBeEnabled();
    });

    await fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Clase de la ontología')).toBeInTheDocument();
    expect(screen.getByLabelText(/Título/)).toBeInTheDocument();
  });

  it('shows a created node in the list of the workspace', async () => {
    stubFetch({
      nodes: () => json({ nodes: [NODE_A, NODE_B], nextCursor: null }),
      proposals: () => json({ proposals: [], nextCursor: null }),
      createNode: () =>
        json(
          {
            id: NEW_NODE.id,
            workspaceId: WORKSPACE_ID,
            typeKey: NEW_NODE.typeKey,
            title: NEW_NODE.title,
            description: null,
            status: 'PENDING'
          },
          201
        ),
      getNode: () => json({ node: NEW_NODE })
    });

    renderPage();

    const button = screen.getByRole('button', { name: 'Nuevo nodo' });
    await waitFor(() => {
      expect(button).toBeEnabled();
    });

    await fireEvent.click(button);
    await fireEvent.input(screen.getByLabelText(/Título/), { target: { value: NEW_NODE.title } });
    await fireEvent.click(screen.getByRole('button', { name: 'Crear el nodo' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: NEW_NODE.title })).toBeInTheDocument();
    });
  });

  it('relates the selected node to another one', async () => {
    stubFetch({
      nodes: () => json({ nodes: [NODE_A, NODE_B], nextCursor: null }),
      subgraph: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] }),
      proposals: () => json({ proposals: [], nextCursor: null })
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: NODE_A.title })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: NODE_A.title }));

    const relate = await screen.findByRole('button', { name: 'Relacionar con otro nodo' });
    await fireEvent.click(relate);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Only the relations of the class of the source are offered.
    const picker = screen.getByLabelText('Relación (obligatorio)') as HTMLSelectElement;
    expect(Array.from(picker.options).map((option) => option.value)).toEqual(['RELATES_TO']);
  });

  it('shows the selected node in the inspector', async () => {
    stubFetch({
      nodes: () => json({ nodes: [NODE_A, NODE_B], nextCursor: null }),
      subgraph: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] }),
      proposals: () => json({ proposals: [], nextCursor: null })
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: NODE_A.title })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: NODE_A.title }));

    // The inspector shows the four tabs and the selected node.
    expect(screen.getByRole('tab', { name: 'Contenido' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Atributos' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Propuestas' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Foro' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: NODE_A.title })).toBeInTheDocument();
    });
  });

  it('shows the selected relation in the inspector, read from the API', async () => {
    const fetchMock = stubFetch({
      nodes: () => json({ nodes: [NODE_A, NODE_B], nextCursor: null }),
      subgraph: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] }),
      proposals: () => json({ proposals: [], nextCursor: null }),
      edge: () => json({ edge: EDGE_DTO })
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: NODE_A.title })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: NODE_A.title }));

    // The relation row of the list is selectable too.
    await openList();

    const relation = await screen.findByRole('button', { name: RELATION_NAMES.SUGGESTS.es });
    await fireEvent.click(relation);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: RELATION_NAMES.SUGGESTS.es })
      ).toBeInTheDocument();
    });

    // The relation is not in the subgraph response: it was read.
    expect(
      fetchMock.mock.calls.some((entry) => String(entry[0]).includes(`/edges/${EDGE.id}`))
    ).toBe(true);
  });
});
