import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '$lib/api/client';
import { filterProposalsByTarget, loadNodeProposalHistory } from '$lib/api/proposals';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import { NODE_A, NODE_B, OTHER_PROPOSAL, PROPOSAL, WORKSPACE_ID } from './fixtures/graph';

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

describe('the proposal history of a node', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the proposals of the target only', () => {
    const kept = filterProposalsByTarget([PROPOSAL, OTHER_PROPOSAL], NODE_A.id);

    expect(kept).toEqual([PROPOSAL]);
  });

  it('asks the API for the node proposals of one bounded page', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(json({ proposals: [PROPOSAL, OTHER_PROPOSAL], nextCursor: null }));

    const history = await loadNodeProposalHistory(client, NODE_A.id);

    // The API has no `targetId` filter: the page is narrowed by `targetType`.
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${BASE_URL}/proposals?targetType=NODE&limit=100`
    );
    expect(history.proposals).toEqual([PROPOSAL]);
  });

  it('reports a complete history when the page was not truncated', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(json({ proposals: [PROPOSAL], nextCursor: null }));

    const history = await loadNodeProposalHistory(client, NODE_A.id);

    expect(history.truncated).toBe(false);
  });

  it('reports a partial history when the page was truncated', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(json({ proposals: [PROPOSAL], nextCursor: 'cursor-2' }));

    const history = await loadNodeProposalHistory(client, NODE_A.id);

    expect(history.truncated).toBe(true);
    expect(history.proposals).toEqual([PROPOSAL]);
  });

  it('finds nothing when the page holds no proposal of the target', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(json({ proposals: [OTHER_PROPOSAL], nextCursor: null }));

    const history = await loadNodeProposalHistory(client, NODE_B.id);

    expect(history.proposals).toEqual([OTHER_PROPOSAL]);
  });
});
