import { render, screen, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '$lib/api/client';
import {
  API_CLIENT_CONTEXT_KEY,
  SESSION_CONTEXT_KEY,
  WORKSPACE_CONTEXT_KEY
} from '$lib/state/context';
import { DEFAULT_PANEL_PREFERENCES } from '$lib/state/panels.svelte';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import type { AuthUserDto, WorkspaceSummaryDto } from '@vozlab/shared-types';
import { contextWithLocale } from './harness/locale';
import AppLayout from '../src/routes/(app)/+layout.svelte';

const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto }));

const { pageState } = vi.hoisted(() => ({
  pageState: { url: new URL('http://localhost:5173/proposals') }
}));
vi.mock('$app/state', () => ({ page: pageState }));

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

const BASE_URL = 'http://localhost:3000/api/v1';

const USER: AuthUserDto = {
  id: '44444444-4444-4444-8444-444444444444',
  email: 'ada@example.edu',
  fullName: 'Ada Lovelace',
  anonymousAlias: null,
  provider: 'OIDC_INSTITUTIONAL',
  systemRole: 'USER',
  authorHash: 'a'.repeat(64)
};

const WORKSPACE: WorkspaceSummaryDto = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'general',
  name: 'General',
  role: 'ADMIN'
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

/** Stubs `fetch` with one answer per API path. */
function stubFetch(answers: {
  refresh?: () => Response | Promise<Response>;
  me?: () => Response | Promise<Response>;
}): void {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith('/auth/refresh')) {
      if (!answers.refresh) throw new Error(`unexpected request: ${url}`);
      return answers.refresh();
    }

    if (url.endsWith('/auth/me')) {
      if (!answers.me) throw new Error(`unexpected request: ${url}`);
      return answers.me();
    }

    throw new Error(`unexpected request: ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);
}

function renderLayout(): { session: SessionState; workspace: WorkspaceState } {
  const session = new SessionState();
  const workspace = new WorkspaceState();
  const client = new ApiClient({ baseUrl: BASE_URL, session, workspace });

  const context = contextWithLocale([
    [SESSION_CONTEXT_KEY, session],
    [WORKSPACE_CONTEXT_KEY, workspace],
    [API_CLIENT_CONTEXT_KEY, client]
  ]);

  const children = createRawSnippet(() => ({ render: () => '<p>Page of the app</p>' }));

  render(AppLayout, {
    props: { params: {}, data: { apiBaseUrl: BASE_URL, locale: 'es', panels: DEFAULT_PANEL_PREFERENCES }, children },
    context
  });

  return { session, workspace };
}

describe('the (app) guard', () => {
  beforeEach(() => {
    goto.mockClear();
    pageState.url = new URL('http://localhost:5173/proposals');
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the restoring state instead of the workspace selector', () => {
    // The refresh never answers: the guard stays in its restoring state.
    stubFetch({ refresh: () => new Promise<Response>(() => {}) });

    renderLayout();

    expect(screen.getByRole('status')).toHaveTextContent(/restaurando tu sesión/i);
    expect(screen.queryByLabelText('Espacio de trabajo')).not.toBeInTheDocument();
  });

  it('sends the user to the login page when the session cannot be restored', async () => {
    stubFetch({
      refresh: () =>
        json(
          {
            code: 'ERR_REFRESH_TOKEN_INVALID',
            message: 'Refresh token is invalid, expired or already rotated'
          },
          401
        )
    });

    renderLayout();

    await waitFor(() => {
      expect(goto).toHaveBeenCalledWith('/login?next=%2Fproposals');
    });
  });

  it('shows the no-workspace state when the account has no membership', async () => {
    stubFetch({
      refresh: () =>
        json({ accessToken: 'token', expiresAt: '2026-10-19T12:15:00.000Z', user: USER }),
      me: () => json({ ...USER, workspaces: [] })
    });

    renderLayout();

    await waitFor(() => {
      expect(screen.getByText(/no hay ningún espacio de trabajo en esta institución/i)).toBeInTheDocument();
    });

    // A valid account without a membership is not a redirect loop.
    expect(goto).not.toHaveBeenCalled();
  });

  it('renders the application once the session is restored', async () => {
    stubFetch({
      refresh: () =>
        json({ accessToken: 'token', expiresAt: '2026-10-19T12:15:00.000Z', user: USER }),
      me: () => json({ ...USER, workspaces: [WORKSPACE] })
    });

    const { workspace } = renderLayout();

    await waitFor(() => {
      expect(screen.getByText('Page of the app')).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: 'Propuestas' })).toBeInTheDocument();
    expect(screen.getByLabelText('Espacio de trabajo')).toBeInTheDocument();
    expect(workspace.currentWorkspaceId).toBe(WORKSPACE.id);
    expect(goto).not.toHaveBeenCalled();
  });
});
