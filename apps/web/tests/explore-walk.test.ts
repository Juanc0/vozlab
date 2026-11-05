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

const BASE_URL = 'http://localhost:3000/api/v1';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

interface Answers {
  window?: () => Response | Promise<Response>;
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

function callsTo(fetchMock: ReturnType<typeof vi.fn>, path: string): string[] {
  return fetchMock.mock.calls
    .map((entry) => String(entry[0]))
    .filter((url) => url.includes(path));
}

describe('walking the graph by clicking a node', () => {
  beforeEach(() => {
    sessionStorage.clear();
    goto.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function openExploration(): Promise<void> {
    renderPage();

    await fireEvent.click(screen.getByRole('radio', { name: 'Explorar' }));

    await waitFor(
      () => {
        expect(
          screen.getByRole('img', { name: 'Lienzo de la ventana de exploración' })
        ).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  }

  async function openList(): Promise<void> {
    await fireEvent.click(screen.getByRole('button', { name: 'Lista' }));

    await waitFor(() => {
      expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
    });
  }

  it('asks the API for the subgraph of the clicked node, at the selected depth', async () => {
    const fetchMock = stubFetch({
      window: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] }),
      subgraph: () => json({ nodes: [NODE_B, NODE_C], edges: [EDGE_B] })
    });

    await openExploration();
    await openList();

    const [nodeTable] = screen.getAllByRole('table');
    const walk = within(nodeTable).getAllByRole('button', { name: 'Caminar' })[0];

    const nodeId = await walk.getAttribute('data-node-id');
    expect(nodeId).toBeTruthy();

    const windowsBefore = callsTo(fetchMock, '/nodes/window').length;

    await fireEvent.click(walk);

    await waitFor(() => {
      expect(callsTo(fetchMock, '/nodes/subgraph')).toHaveLength(1);
    });

    const call = callsTo(fetchMock, '/nodes/subgraph')[0] ?? '';

    expect(call).toContain(`rootId=${nodeId}`);
    expect(call).toContain('depth=1');

    expect(callsTo(fetchMock, '/nodes/window')).toHaveLength(windowsBefore);
  });

  it('merges the answer into the working set: what was seen is still there', async () => {
    stubFetch({
      window: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] }),
      subgraph: () => json({ nodes: [NODE_B, NODE_C], edges: [EDGE_B] })
    });

    await openExploration();
    await openList();

    const [nodeTable] = screen.getAllByRole('table');
    const walk = within(nodeTable).getAllByRole('button', { name: 'Caminar' })[0];

    await fireEvent.click(walk);

    await waitFor(() => {
      expect(within(nodeTable).getByRole('button', { name: NODE_C.title })).toBeInTheDocument();
    });

    expect(within(nodeTable).getByRole('button', { name: NODE_A.title })).toBeInTheDocument();

    const [, relationTable] = screen.getAllByRole('table');

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

    await openList();

    const [nodeTable] = screen.getAllByRole('table');
    const walk = within(nodeTable).getAllByRole('button', { name: 'Caminar' })[0];

    await fireEvent.click(walk);

    await waitFor(() => {
      expect(screen.getByText(/Recuperando el entorno/)).toBeInTheDocument();
    });

    const canvas = document.querySelector('[aria-label="Lienzo de la ventana de exploración"]');
    expect(canvas).not.toBeNull();

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
    await openList();

    const [nodeTable] = screen.getAllByRole('table');
    const walk = within(nodeTable).getAllByRole('button', { name: 'Caminar' })[0];

    await fireEvent.click(walk);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('ERR_NODE_NOT_FOUND');
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Node not found');

    expect(within(nodeTable).getByRole('button', { name: NODE_A.title })).toBeInTheDocument();
  });

  it('says that a node without relations is not a failure', async () => {
    stubFetch({
      window: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] }),
      subgraph: () => json({ nodes: [NODE_C], edges: [] })
    });

    await openExploration();
    await openList();

    const [nodeTable] = screen.getAllByRole('table');
    const walk = within(nodeTable).getAllByRole('button', { name: 'Caminar' })[0];

    await fireEvent.click(walk);

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

    expect(screen.getByRole('radio', { name: 'El más reciente' })).toBeChecked();

    await waitFor(() => {
      expect(document.querySelector('g.vozlab-svg-card')).not.toBeNull();
    });

    const card = document.querySelector(`g.vozlab-svg-card[data-node-id="${NODE_B.id}"]`) as Element;
    expect(card).not.toBeNull();
    await fireEvent.click(card);

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'El elegido a mano' })).toBeChecked();
    });

    expect(screen.getByText('Criterio activo: El elegido a mano.')).toBeInTheDocument();
  });

  it('centres the view on the node the reader walked to', async () => {
    stubFetch({
      window: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] }),
      subgraph: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] })
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: NODE_A.title })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: NODE_A.title }));

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Lienzo del subgrafo' })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Lista' }));

    await waitFor(() => {
      expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
    });

    const nodeTable = screen.getAllByRole('table')[0];
    const walk = within(nodeTable).getAllByRole('button', { name: 'Caminar' })[1];

    const targetId = await walk.getAttribute('data-node-id');
    expect(targetId).toBeTruthy();

    const before = document.querySelector('.vozlab-svg-viewport')?.getAttribute('transform');

    await fireEvent.click(walk);

    await waitFor(() => {
      const after = document.querySelector('.vozlab-svg-viewport')?.getAttribute('transform');
      expect(after).not.toBe(before);
    });

    const viewportTransform = document.querySelector('.vozlab-svg-viewport')?.getAttribute('transform') ?? '';
    const cardTransform = document.querySelector(`g.vozlab-svg-card[data-node-id="${targetId}"]`)?.getAttribute('transform') ?? '';

    const viewportMatch = /translate\(([^,]+),([^)]+)\) scale\(([^)]+)\)/.exec(viewportTransform);
    const cardMatch = /translate\(([^ ]+) ([^)]+)\)/.exec(cardTransform);

    expect(viewportMatch).not.toBeNull();
    expect(cardMatch).not.toBeNull();

    const vx = Number(viewportMatch![1]);
    const vy = Number(viewportMatch![2]);
    const vk = Number(viewportMatch![3]);
    const cx = Number(cardMatch![1]);
    const cy = Number(cardMatch![2]);

    const svg = (document.querySelector('.vozlab-svg-viewport') as SVGElement | null)?.ownerSVGElement;
    const width = Number(svg?.getAttribute('width') ?? 800);
    const height = Number(svg?.getAttribute('height') ?? 600);

    expect(vx + cx * vk).toBeCloseTo(width / 2, 0);
    expect(vy + cy * vk).toBeCloseTo(height / 2, 0);
  });

  it('walks to the node the reader clicks on the canvas', async () => {
    const fetchMock = stubFetch({
      window: () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] }),
      subgraph: () => json({ nodes: [NODE_B, NODE_C], edges: [EDGE_B] })
    });

    await openExploration();

    const card = document.querySelector<SVGGElement>('.vozlab-svg-card[data-node-id]');

    expect(card).not.toBeNull();

    const nodeId = card?.getAttribute('data-node-id') ?? '';

    await fireEvent.click(card!);

    await waitFor(() => {
      expect(callsTo(fetchMock, '/nodes/subgraph')).toHaveLength(1);
    });

    // The click is a walk, not only a selection: the canvas stays a way to
    // move through the graph, which is what the incumbent offered.
    expect(callsTo(fetchMock, '/nodes/subgraph')[0]).toContain(nodeId);
  });
});
