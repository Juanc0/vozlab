import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '$lib/api/client';
import {
  API_CLIENT_CONTEXT_KEY,
  SESSION_CONTEXT_KEY,
  WORKSPACE_CONTEXT_KEY
} from '$lib/state/context';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import WorkspaceAdmin from '../src/routes/(app)/workspace-admin/+page.svelte';
import { contextWithLocale } from './harness/locale';

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

const BASE_URL = 'http://localhost:3000/api/v1';
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const PROPOSER_HASH = 'p'.repeat(64);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

const PROPOSAL_CLASS = {
  id: 'class-1',
  workspaceId: WORKSPACE_ID,
  systemKey: 'FooClass',
  displayNames: { en: 'Foo', es: 'Foo' },
  descriptions: {},
  parentClassKey: null,
  status: 'PROPOSED',
  proposedBy: PROPOSER_HASH,
  createdAt: '2026-01-01T00:00:00.000Z',
  communityScore: 0
};

function makeFetch(proposals: unknown, active: unknown, opts: { failActivate?: boolean } = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.includes('/workspaces/' + WORKSPACE_ID) && method === 'GET') {
      return json({ id: WORKSPACE_ID, slug: 'general', name: 'General', description: null, isPublic: true, kind: 'PRIVATE', createdAt: '2026-01-01T00:00:00Z', memberCount: 1, pendingRequestCount: 0 });
    }
    if (url.includes('/ontology/proposals')) {
      return json(proposals);
    }
    if (url.includes('/ontology') && !url.includes('/proposals')) {
      // active ontology (GET /ontology)
      if (method === 'GET') return json(active);
    }
    if (url.includes('/ontology/classes/') && url.includes('/activate')) {
      if (opts.failActivate) return json({ code: 'ERR_FAIL', message: 'boom' }, 500);
      return json({ id: 'class-1', systemKey: 'FooClass', status: 'ACTIVE' });
    }
    if (url.includes('/ontology/classes/') && url.includes('/reject')) {
      return json({ id: 'class-1', systemKey: 'FooClass', status: 'REJECTED' });
    }
    if (url.includes('/members')) return json([]);
    if (url.includes('/join-requests')) return json([]);
    if (url.includes('/invitations')) return json([]);
    if (url.includes('/join-codes')) return json([]);
    return json({});
  });
}

function renderPage(role: 'ADMIN' | 'MODERATOR' | 'MEMBER' | 'GUEST', authorHash: string | null, fetchMock: ReturnType<typeof vi.fn>) {
  const session = new SessionState();
  if (authorHash) {
    session.setSession({
      accessToken: 'token',
      expiresAt: '2026-11-01T00:00:00.000Z',
      user: { id: 'u', fullName: 'Ada', anonymousAlias: null, provider: 'OIDC', systemRole: 'USER', authorHash }
    });
  }
  const workspace = new WorkspaceState();
  workspace.hydrate([{ id: WORKSPACE_ID, slug: 'general', name: 'General', role }]);
  workspace.setWorkspace(WORKSPACE_ID);
  vi.stubGlobal('fetch', fetchMock);
  const client = new ApiClient({ baseUrl: BASE_URL, session, workspace });
  render(WorkspaceAdmin, {
    context: contextWithLocale([
      [SESSION_CONTEXT_KEY, session],
      [WORKSPACE_CONTEXT_KEY, workspace],
      [API_CLIENT_CONTEXT_KEY, client]
    ])
  });
  return { session, workspace, fetchMock };
}

async function openOntologyTab() {
  await waitFor(() => expect(screen.getByRole('tab', { name: /ontolog/i })).toBeInTheDocument());
  await fireEvent.click(screen.getByRole('tab', { name: /ontolog/i }));
  await waitFor(() => expect(screen.getByText('FooClass')).toBeInTheDocument());
}

describe('workspace-admin ontology tab', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('disables Activate/Reject for non-author non-moderator', async () => {
    const fetchMock = makeFetch({ classes: [PROPOSAL_CLASS], datatypeProperties: [], objectProperties: [] }, { classes: [], datatypeProperties: [], objectProperties: [] });
    renderPage('MEMBER', 'other-hash'.padEnd(64, 'x'), fetchMock);
    await openOntologyTab();
    const activate = screen.getByRole('button', { name: /activar/i });
    const reject = screen.getByRole('button', { name: /rechazar/i });
    expect(activate).toBeDisabled();
    expect(reject).toBeDisabled();
  });

  it('enables Activate/Reject for the proposer', async () => {
    const fetchMock = makeFetch({ classes: [PROPOSAL_CLASS], datatypeProperties: [], objectProperties: [] }, { classes: [], datatypeProperties: [], objectProperties: [] });
    renderPage('MEMBER', PROPOSER_HASH, fetchMock);
    await openOntologyTab();
    const activate = screen.getByRole('button', { name: /activar/i });
    const reject = screen.getByRole('button', { name: /rechazar/i });
    expect(activate).not.toBeDisabled();
    expect(reject).not.toBeDisabled();
  });

  it('enables Activate/Reject for a moderator', async () => {
    const fetchMock = makeFetch({ classes: [PROPOSAL_CLASS], datatypeProperties: [], objectProperties: [] }, { classes: [], datatypeProperties: [], objectProperties: [] });
    renderPage('MODERATOR', 'other-hash'.padEnd(64, 'x'), fetchMock);
    await openOntologyTab();
    const activate = screen.getByRole('button', { name: /activar/i });
    const reject = screen.getByRole('button', { name: /rechazar/i });
    expect(activate).not.toBeDisabled();
    expect(reject).not.toBeDisabled();
  });

  it('updates optimistically and rolls back on error', async () => {
    const fetchMock = makeFetch({ classes: [PROPOSAL_CLASS], datatypeProperties: [], objectProperties: [] }, { classes: [], datatypeProperties: [], objectProperties: [] }, { failActivate: true });
    renderPage('MEMBER', PROPOSER_HASH, fetchMock);
    await openOntologyTab();
    const activate = screen.getByRole('button', { name: /activar/i });
    await fireEvent.click(activate);
    await waitFor(() => {
      expect(screen.getByText('FooClass')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows vote buttons on ontology proposals', async () => {
    const fetchMock = makeFetch({ classes: [PROPOSAL_CLASS], datatypeProperties: [], objectProperties: [] }, { classes: [], datatypeProperties: [], objectProperties: [] });
    renderPage('MEMBER', PROPOSER_HASH, fetchMock);
    await openOntologyTab();
    const upvotes = screen.getAllByRole('button', { name: /votar a favor/i });
    expect(upvotes.length).toBeGreaterThan(0);
  });

  it('shows linked discussion threads', async () => {
    const fetchMock = makeFetch({ classes: [PROPOSAL_CLASS], datatypeProperties: [], objectProperties: [] }, { classes: [], datatypeProperties: [], objectProperties: [] });
    renderPage('MEMBER', PROPOSER_HASH, fetchMock);
    await openOntologyTab();
    const links = screen.getAllByRole('link', { name: /discusi/i });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0].getAttribute('href')).toContain('/discussions');
  });

  it('opens the deprecate modal with a migration target picker', async () => {
    const active = { classes: [{ id: 'active-1', workspaceId: WORKSPACE_ID, systemKey: 'ActiveFoo', displayNames: { en: 'ActiveFoo' }, descriptions: {}, parentClassKey: null, status: 'ACTIVE', proposedBy: PROPOSER_HASH, createdAt: '2026-01-01T00:00:00.000Z', communityScore: 0 }], datatypeProperties: [], objectProperties: [] };
    const fetchMock = makeFetch({ classes: [], datatypeProperties: [], objectProperties: [] }, active);
    renderPage('MODERATOR', PROPOSER_HASH, fetchMock);
    await waitFor(() => expect(screen.getByRole('tab', { name: /ontolog/i })).toBeInTheDocument());
    await fireEvent.click(screen.getByRole('tab', { name: /ontolog/i }));
    await waitFor(() => expect(screen.getByText('ActiveFoo')).toBeInTheDocument());
    const deprecateBtn = screen.getByRole('button', { name: /deprecar/i });
    await fireEvent.click(deprecateBtn);
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());
  });
});
