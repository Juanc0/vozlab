import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '$lib/api/client';
import { ApiError } from '$lib/api/errors';
import {
  NODE_WINDOW_MAX_LIMIT,
  SUBGRAPH_MAX_DEPTH,
  SUBGRAPH_MAX_NODES,
  buildSubgraphQuery,
  clampDepth,
  clampNodeWindowLimit,
  clampSubgraphLimit,
  listWorkspaceNodes,
  loadNodeWindow,
  loadSubgraph
} from '$lib/api/graph';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import { NODE_A, NODE_B, WORKSPACE_ID } from './fixtures/graph';

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

const BASE_URL = 'http://localhost:3000/api/v1';

function harness(): { client: ApiClient; fetchMock: ReturnType<typeof vi.fn> } {
  const session = new SessionState();
  const workspace = new WorkspaceState();
  workspace.hydrate([{ id: WORKSPACE_ID, slug: 'general', name: 'General', role: 'MEMBER' }]);
  workspace.setWorkspace(WORKSPACE_ID);

  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  return { client: new ApiClient({ baseUrl: BASE_URL, session, workspace }), fetchMock };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('the subgraph query', () => {
  it('carries the root, the depth and the limit', () => {
    expect(buildSubgraphQuery(NODE_A.id, 2, 50)).toEqual({
      rootId: NODE_A.id,
      depth: 2,
      limit: 50
    });
  });

  it('clamps the depth to the window the API accepts', () => {
    expect(clampDepth(-4)).toBe(0);
    expect(clampDepth(0)).toBe(0);
    expect(clampDepth(3)).toBe(3);
    expect(clampDepth(9)).toBe(SUBGRAPH_MAX_DEPTH);
    expect(clampDepth(Number.NaN)).toBe(1);
  });

  it('clamps the node budget to the window the API accepts', () => {
    expect(clampSubgraphLimit(0)).toBe(1);
    expect(clampSubgraphLimit(1)).toBe(1);
    expect(clampSubgraphLimit(200)).toBe(SUBGRAPH_MAX_NODES);
    expect(clampSubgraphLimit(5000)).toBe(SUBGRAPH_MAX_NODES);
    expect(clampSubgraphLimit(Number.NaN)).toBe(100);
  });

  it('clamps the query it builds', () => {
    expect(buildSubgraphQuery(NODE_A.id, 12, 9000)).toEqual({
      rootId: NODE_A.id,
      depth: SUBGRAPH_MAX_DEPTH,
      limit: SUBGRAPH_MAX_NODES
    });
  });
});

describe('loading a subgraph', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('asks the API for the bounded window around the root', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(json({ nodes: [NODE_A, NODE_B], edges: [] }));

    const subgraph = await loadSubgraph(client, { rootId: NODE_A.id, depth: 2, limit: 25 });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${BASE_URL}/nodes/subgraph?rootId=${NODE_A.id}&depth=2&limit=25`
    );
    expect(subgraph.nodes).toHaveLength(2);
    expect(subgraph.edges).toEqual([]);
  });

  it('clamps the window before the request leaves the app', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(json({ nodes: [], edges: [] }));

    await loadSubgraph(client, { rootId: NODE_A.id, depth: 99, limit: 9000 });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${BASE_URL}/nodes/subgraph?rootId=${NODE_A.id}&depth=${SUBGRAPH_MAX_DEPTH}&limit=${SUBGRAPH_MAX_NODES}`
    );
  });

  it('surfaces the API envelope of a missing root', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(
      json({ code: 'ERR_NODE_NOT_FOUND', message: 'Node not found' }, 404)
    );

    const error = (await loadSubgraph(client, {
      rootId: NODE_A.id,
      depth: 1,
      limit: 10
    }).catch((caught: unknown) => caught)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('ERR_NODE_NOT_FOUND');
    expect(error.message).toBe('Node not found');
  });
});

describe('loading the exploration window', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('asks the API for the window of the workspace', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(json({ nodes: [NODE_A, NODE_B], edges: [] }));

    const answer = await loadNodeWindow(client, { limit: 100 });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE_URL}/nodes/window?limit=100`);
    expect(answer.nodes).toHaveLength(2);
    expect(answer.edges).toEqual([]);
  });

  it('clamps the window before the request leaves the app', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(json({ nodes: [], edges: [] }));

    await loadNodeWindow(client, { limit: 9000 });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${BASE_URL}/nodes/window?limit=${NODE_WINDOW_MAX_LIMIT}`
    );
  });

  it('clamps a size that is not a number', () => {
    expect(clampNodeWindowLimit(Number.NaN)).toBe(100);
    expect(clampNodeWindowLimit(0)).toBe(1);
    expect(clampNodeWindowLimit(-3)).toBe(1);
  });
});

describe('listing the newest nodes', () => {  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads the first page and exposes the cursor', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(json({ nodes: [NODE_A], nextCursor: 'cursor-2' }));

    const page = await listWorkspaceNodes(client, { limit: 20 });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE_URL}/nodes?limit=20`);
    expect(page.items).toEqual([NODE_A]);
    expect(page.nextCursor).toBe('cursor-2');
  });

  it('passes the cursor of the next page', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(json({ nodes: [NODE_B], nextCursor: null }));

    const page = await listWorkspaceNodes(client, { limit: 20, cursor: 'cursor-2' });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE_URL}/nodes?limit=20&cursor=cursor-2`);
    expect(page.nextCursor).toBeNull();
  });
});
