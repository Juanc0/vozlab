import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '$lib/api/client';
import {
  API_CLIENT_CONTEXT_KEY,
  SESSION_CONTEXT_KEY,
  WORKSPACE_CONTEXT_KEY
} from '$lib/state/context';
import { SessionState } from '$lib/state/session.svelte';
import { ACTIVE_WORKSPACE_STORAGE_KEY, WorkspaceState } from '$lib/state/workspace.svelte';
import AdminPage from '../src/routes/(app)/admin/+page.svelte';
import { contextWithLocale } from './harness/locale';

const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto }));

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

const BASE_URL = 'http://localhost:3000/api/v1';
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/admin/workspaces')) {
      if (init?.method === 'POST') return json({ id: 'w2', slug: 'w2', name: 'W2', description: null, isPublic: true, kind: 'PRIVATE', createdAt: '2026-01-01T00:00:00Z', memberCount: 0, pendingRequestCount: 0, joinCode: 'code' }, 201);
      return json({ workspaces: [{ id: 'w1', slug: 'w1', name: 'W1', description: null, isPublic: true, kind: 'PRIVATE', createdAt: '2026-01-01T00:00:00Z', memberCount: 2, pendingRequestCount: 1 }] });
    }
    if (url.endsWith('/admin/users')) {
      return json({ users: [{ id: USER_ID, handle: 'ada', fullName: 'Ada', systemRole: 'USER', provider: 'OIDC', createdAt: '2026-01-01T00:00:00Z', memberships: [] }], nextCursor: null });
    }
    if (url.endsWith(`/admin/users/${USER_ID}`)) {
      return json({ id: USER_ID, systemRole: 'ADMIN' });
    }
    if (url.endsWith(`/admin/users/${USER_ID}/suspend`) || url.endsWith(`/admin/users/${USER_ID}/activate`)) {
      return new Response(null, { status: 204 });
    }
    if (url.endsWith('/admin/cleanup')) {
      return json({ expiredInvitations: 1, removedGuests: 2 });
    }
    throw new Error(`unexpected request: ${url} ${init?.method}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderAdmin() {
  const session = new SessionState();
  session.setSession({
    accessToken: 'token',
    expiresAt: '2026-11-01T00:00:00.000Z',
    user: { id: 'u', fullName: 'Admin', anonymousAlias: null, provider: 'OIDC', systemRole: 'ADMIN', authorHash: 'a'.repeat(64) }
  });
  const workspace = new WorkspaceState();
  workspace.hydrate([{ id: WORKSPACE_ID, slug: 'general', name: 'General', role: 'ADMIN' }]);
  workspace.setWorkspace(WORKSPACE_ID);
  const client = new ApiClient({ baseUrl: BASE_URL, session, workspace });
  render(AdminPage, {
    context: contextWithLocale([
      [SESSION_CONTEXT_KEY, session],
      [WORKSPACE_CONTEXT_KEY, workspace],
      [API_CLIENT_CONTEXT_KEY, client]
    ])
  });
  return { session, workspace, client };
}

describe('admin page', () => {
  beforeEach(() => {
    goto.mockClear();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders tabs and switches to users', async () => {
    stubFetch();
    renderAdmin();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Espacios de trabajo' })).toBeInTheDocument());
    const usersTab = screen.getByRole('tab', { name: 'Usuarios' });
    await fireEvent.click(usersTab);
    await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument());
    // row action suspend
    const fetchMock = (globalThis.fetch as unknown) as ReturnType<typeof vi.fn>;
    await fireEvent.click(screen.getByRole('button', { name: 'Suspender' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it('changes system role via dropdown', async () => {
    stubFetch();
    renderAdmin();
    await fireEvent.click(screen.getByRole('tab', { name: 'Usuarios' }));
    await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument());
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    // find the user row select; there may be kind select in create form but on users tab only role select
    await fireEvent.change(select, { target: { value: 'ADMIN' } });
    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const patchCall = calls.find((c) => String(c[0]).includes('/admin/users/') && (c[1] as RequestInit)?.method === 'PATCH');
      expect(patchCall).toBeDefined();
    });
  });
});
