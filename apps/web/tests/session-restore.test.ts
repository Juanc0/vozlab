import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adoptSession, restoreSession } from '$lib/auth/restore';
import { ApiClient } from '$lib/api/client';
import { SessionState } from '$lib/state/session.svelte';
import { ACTIVE_WORKSPACE_STORAGE_KEY, WorkspaceState } from '$lib/state/workspace.svelte';
import type { AuthSessionDto, AuthUserDto, WorkspaceSummaryDto } from '@vozlab/shared-types';

// The workspace state only touches the storage in the browser.
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

const SESSION: AuthSessionDto = {
  accessToken: 'header.payload.signature',
  expiresAt: '2026-10-19T12:15:00.000Z',
  user: USER
};

const WORKSPACE_A: WorkspaceSummaryDto = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'general',
  name: 'General',
  role: 'ADMIN'
};

const WORKSPACE_B: WorkspaceSummaryDto = {
  id: '22222222-2222-4222-8222-222222222222',
  slug: 'research',
  name: 'Research',
  role: 'MEMBER'
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

interface Harness {
  readonly client: ApiClient;
  readonly session: SessionState;
  readonly workspace: WorkspaceState;
  readonly calls: string[];
}

interface HarnessOptions {
  /** The answer of `POST /auth/refresh`. */
  readonly refresh?: () => Response;
  /** The answer of `GET /auth/me`. */
  readonly me?: () => Response;
  /** A workspace id persisted for this tab before the state is created. */
  readonly persisted?: string;
}

function harness(options: HarnessOptions = {}): Harness {
  const calls: string[] = [];

  sessionStorage.clear();
  if (options.persisted !== undefined) {
    sessionStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, options.persisted);
  }

  const session = new SessionState();
  const workspace = new WorkspaceState();

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    if (url.endsWith('/auth/refresh')) {
      if (!options.refresh) {
        throw new Error(`unexpected request: ${url}`);
      }
      return options.refresh();
    }

    if (url.endsWith('/auth/me')) {
      if (!options.me) {
        throw new Error(`unexpected request: ${url}`);
      }
      return options.me();
    }

    throw new Error(`unexpected request: ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);

  return {
    client: new ApiClient({ baseUrl: BASE_URL, session, workspace }),
    session,
    workspace,
    calls
  };
}

describe('restoreSession', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adopts the session, hydrates the workspaces and selects the active one', async () => {
    const { client, session, workspace } = harness({
      refresh: () => json(SESSION),
      me: () => json({ ...USER, workspaces: [WORKSPACE_A, WORKSPACE_B] })
    });

    const outcome = await restoreSession({ client, session, workspace });

    expect(outcome.status).toBe('restored');
    expect(outcome.error).toBeNull();
    expect(session.accessToken).toBe('header.payload.signature');
    expect(session.user?.id).toBe(USER.id);
    expect(workspace.workspaces).toEqual([WORKSPACE_A, WORKSPACE_B]);
    expect(workspace.currentWorkspaceId).toBe(WORKSPACE_A.id);
    expect(workspace.role).toBe('ADMIN');
    expect(sessionStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBe(WORKSPACE_A.id);
  });

  it('keeps the workspace persisted for this tab when the user is still a member', async () => {
    const { client, session, workspace } = harness({
      refresh: () => json(SESSION),
      me: () => json({ ...USER, workspaces: [WORKSPACE_A, WORKSPACE_B] }),
      persisted: WORKSPACE_B.id
    });

    const outcome = await restoreSession({ client, session, workspace });

    expect(outcome.status).toBe('restored');
    expect(workspace.currentWorkspaceId).toBe(WORKSPACE_B.id);
    expect(workspace.role).toBe('MEMBER');
    expect(sessionStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBe(WORKSPACE_B.id);
  });

  it('drops a persisted workspace the user is no longer a member of', async () => {
    const { client, session, workspace } = harness({
      refresh: () => json(SESSION),
      me: () => json({ ...USER, workspaces: [WORKSPACE_A] }),
      persisted: '99999999-9999-4999-8999-999999999999'
    });

    await restoreSession({ client, session, workspace });

    expect(workspace.currentWorkspaceId).toBe(WORKSPACE_A.id);
    expect(sessionStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBe(WORKSPACE_A.id);
  });

  it('reports an unauthenticated session when the refresh is rejected with a 401', async () => {
    const { client, session, workspace, calls } = harness({
      refresh: () =>
        json(
          {
            code: 'ERR_REFRESH_TOKEN_INVALID',
            message: 'Refresh token is invalid, expired or already rotated'
          },
          401
        )
    });

    const outcome = await restoreSession({ client, session, workspace });

    expect(outcome.status).toBe('unauthenticated');
    expect(outcome.error?.code).toBe('ERR_REFRESH_TOKEN_INVALID');
    expect(outcome.error?.status).toBe(401);
    expect(session.accessToken).toBeNull();
    expect(session.user).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('reports a valid session without memberships instead of an error', async () => {
    const { client, session, workspace } = harness({
      refresh: () => json(SESSION),
      me: () => json({ ...USER, workspaces: [] })
    });

    const outcome = await restoreSession({ client, session, workspace });

    expect(outcome.status).toBe('no-membership');
    expect(outcome.error).toBeNull();
    expect(session.accessToken).toBe('header.payload.signature');
    expect(workspace.workspaces).toEqual([]);
    expect(workspace.currentWorkspaceId).toBe('');
  });

  it('separates a broken API from a missing session', async () => {
    const { client, session, workspace } = harness({
      refresh: () => json(SESSION),
      me: () =>
        json({ code: 'ERR_DATABASE_CONNECTION_FAILED', message: 'Database connection failed' }, 503)
    });

    const outcome = await restoreSession({ client, session, workspace });

    expect(outcome.status).toBe('failed');
    expect(outcome.error?.status).toBe(503);
  });

  it('skips the refresh when an access token is already in memory', async () => {
    const { client, session, workspace, calls } = harness({
      me: () => json({ ...USER, workspaces: [WORKSPACE_A] })
    });

    session.setSession(SESSION);

    const outcome = await restoreSession({ client, session, workspace });

    expect(outcome.status).toBe('restored');
    expect(calls).toEqual([`${BASE_URL}/auth/me`]);
  });
});

describe('adoptSession', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adopts the session of an event join and loads the memberships', async () => {
    const { client, session, workspace } = harness({
      me: () => json({ ...USER, workspaces: [WORKSPACE_B] })
    });

    const outcome = await adoptSession({ client, session, workspace }, SESSION);

    expect(outcome.status).toBe('restored');
    expect(session.accessToken).toBe('header.payload.signature');
    expect(workspace.currentWorkspaceId).toBe(WORKSPACE_B.id);
    expect(workspace.role).toBe('MEMBER');
  });
});
