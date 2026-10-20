import { render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '$lib/api/client';
import NodeDetailsPanel from '$lib/components/NodeDetailsPanel.svelte';
import { API_CLIENT_CONTEXT_KEY, WORKSPACE_CONTEXT_KEY } from '$lib/state/context';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import { NODE_A, PROPOSAL, WORKSPACE_ID } from './fixtures/graph';

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

function renderPanel(node: typeof NODE_A | null): void {
  const session = new SessionState();
  const workspace = new WorkspaceState();
  workspace.hydrate([{ id: WORKSPACE_ID, slug: 'general', name: 'General', role: 'MEMBER' }]);
  workspace.setWorkspace(WORKSPACE_ID);

  const client = new ApiClient({ baseUrl: BASE_URL, session, workspace });

  render(NodeDetailsPanel, {
    props: { node },
    context: new Map<unknown, unknown>([
      [API_CLIENT_CONTEXT_KEY, client],
      [WORKSPACE_CONTEXT_KEY, workspace]
    ])
  });
}

describe('the node details panel', () => {
  beforeEach(() => {
    sessionStorage.clear();
    goto.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the fields of the selected node', async () => {
    const fetchMock = vi.fn(async () => json({ proposals: [], nextCursor: null }));
    vi.stubGlobal('fetch', fetchMock);

    renderPanel(NODE_A);

    expect(screen.getByRole('heading', { name: NODE_A.title })).toBeInTheDocument();
    expect(screen.getByText(NODE_A.description ?? '')).toBeInTheDocument();
    expect(screen.getByText('Problem')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText(NODE_A.authorHash)).toBeInTheDocument();
  });

  it('shows the ontology attributes of the node', async () => {
    const fetchMock = vi.fn(async () => json({ proposals: [], nextCursor: null }));
    vi.stubGlobal('fetch', fetchMock);

    renderPanel(NODE_A);

    expect(screen.getByText('source')).toBeInTheDocument();
    expect(screen.getByText('runbook')).toBeInTheDocument();
    expect(screen.getByText('severity')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows the edit-proposal history of the node', async () => {
    const fetchMock = vi.fn(async () => json({ proposals: [PROPOSAL], nextCursor: null }));
    vi.stubGlobal('fetch', fetchMock);

    renderPanel(NODE_A);

    await waitFor(() => {
      expect(screen.getByText(PROPOSAL.justification ?? '')).toBeInTheDocument();
    });
    expect(screen.getByText('EDIT')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();
  });

  it('says that the history is partial when the page was truncated', async () => {
    const fetchMock = vi.fn(async () => json({ proposals: [PROPOSAL], nextCursor: 'cursor-2' }));
    vi.stubGlobal('fetch', fetchMock);

    renderPanel(NODE_A);

    await waitFor(() => {
      expect(screen.getByText(/partial/i)).toBeInTheDocument();
    });
  });

  it('says that no proposal targets the node', async () => {
    const fetchMock = vi.fn(async () => json({ proposals: [], nextCursor: null }));
    vi.stubGlobal('fetch', fetchMock);

    renderPanel(NODE_A);

    await waitFor(() => {
      expect(screen.getByText('No proposal targets this node.')).toBeInTheDocument();
    });
  });

  it('asks the user to select a node when nothing is selected', () => {
    renderPanel(null);

    expect(screen.getByText(/select a node/i)).toBeInTheDocument();
  });

  it('shows the API envelope when the history cannot be read', async () => {
    const fetchMock = vi.fn(async () =>
      json({ code: 'ERR_INTERNAL_SERVER_ERROR', message: 'The database is down' }, 500)
    );
    vi.stubGlobal('fetch', fetchMock);

    renderPanel(NODE_A);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('ERR_INTERNAL_SERVER_ERROR');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('The database is down');
  });
});
