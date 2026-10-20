import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '$lib/api/client';
import { ApiError } from '$lib/api/errors';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import type { AuthUserDto, WorkspaceSummaryDto } from '@vozlab/shared-types';

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

const BASE_URL = 'http://localhost:3000/api/v1';
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const USER: AuthUserDto = {
  id: '44444444-4444-4444-8444-444444444444',
  email: 'ada@example.edu',
  fullName: 'Ada Lovelace',
  anonymousAlias: null,
  provider: 'OIDC_INSTITUTIONAL',
  systemRole: 'USER',
  authorHash: 'a'.repeat(64)
};

const WORKSPACES: WorkspaceSummaryDto[] = [
  { id: WORKSPACE_ID, slug: 'general', name: 'General', role: 'MEMBER' },
  { id: OTHER_WORKSPACE_ID, slug: 'research', name: 'Research', role: 'MODERATOR' }
];

interface Harness {
  client: ApiClient;
  session: SessionState;
  workspace: WorkspaceState;
  fetchMock: ReturnType<typeof vi.fn>;
}

function harness(): Harness {
  const session = new SessionState();
  session.setSession({
    accessToken: 'header.payload.signature',
    expiresAt: '2026-10-19T12:15:00.000Z',
    user: USER
  });

  const workspace = new WorkspaceState();
  workspace.hydrate(WORKSPACES);
  workspace.setWorkspace(WORKSPACE_ID);

  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  const client = new ApiClient({ baseUrl: BASE_URL, session, workspace });
  return { client, session, workspace, fetchMock };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function headersOf(fetchMock: Harness['fetchMock'], call = 0): Headers {
  const init = fetchMock.mock.calls[call]?.[1] as RequestInit | undefined;
  return new Headers(init?.headers);
}

describe('ApiClient', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('injects the authorization, workspace and correlation headers', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(jsonResponse({ nodes: [] }));

    await client.request({ path: '/nodes' });

    const headers = headersOf(fetchMock);
    expect(headers.get('Authorization')).toBe('Bearer header.payload.signature');
    expect(headers.get('X-Workspace-ID')).toBe(WORKSPACE_ID);
    expect(headers.get('x-correlation-id')).toMatch(UUID_PATTERN);
  });

  it('omits the workspace header when the call asks for it', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(jsonResponse({ id: 'x' }));

    await client.request({ path: '/auth/me', workspace: false });

    const headers = headersOf(fetchMock);
    expect(headers.get('Authorization')).toBe('Bearer header.payload.signature');
    expect(headers.get('X-Workspace-ID')).toBeNull();
  });

  it('omits the authorization header for an anonymous call', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(jsonResponse({ accessToken: 'a', expiresAt: 'b', user: USER }));

    await client.request({ path: '/auth/refresh', method: 'POST', auth: 'none' });

    const headers = headersOf(fetchMock);
    expect(headers.get('Authorization')).toBeNull();
  });

  it('sends a unique correlation id per request', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ nodes: [] })));

    await client.request({ path: '/nodes' });
    await client.request({ path: '/nodes' });

    const first = headersOf(fetchMock, 0).get('x-correlation-id');
    const second = headersOf(fetchMock, 1).get('x-correlation-id');
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
  });

  it('sends the refresh cookie and announces a content type only with a body', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(jsonResponse({ id: 'x' }));

    await client.request({ path: '/nodes', method: 'POST', body: { title: 'A node' } });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ title: 'A node' }));

    fetchMock.mockResolvedValue(jsonResponse({ id: 'x' }));
    await client.request({ path: '/nodes' });

    const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(secondInit.headers).get('Content-Type')).toBeNull();
    expect(secondInit.body).toBeUndefined();
  });

  it('builds the URL from the base URL and the query', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(jsonResponse({ nodes: [], nextCursor: null }));

    await client.request({ path: '/nodes', query: { limit: 20, cursor: 'abc', skipped: undefined } });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE_URL}/nodes?limit=20&cursor=abc`);
  });

  it('turns a failed response into an ApiError carrying the envelope', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'ERR_NODE_NOT_FOUND', message: 'Node not found' }, 404)
    );

    const error = await client.request({ path: '/nodes/1' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(404);
    expect(apiError.code).toBe('ERR_NODE_NOT_FOUND');
    expect(apiError.message).toBe('Node not found');
  });

  it('carries the validation issues of a 422', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          code: 'ERR_VALIDATION_FAILED',
          message: 'Validation failed for the request payload',
          issues: [{ code: 'too_small', path: ['title'], message: 'Too small' }]
        },
        422
      )
    );

    const error = (await client.request({ path: '/nodes', method: 'POST' }).catch((caught) => caught)) as ApiError;

    expect(error.code).toBe('ERR_VALIDATION_FAILED');
    expect(error.issues).toHaveLength(1);
    expect(error.issues[0]?.path).toEqual(['title']);
    expect(error.issues[0]?.message).toBe('Too small');
    expect(error.isValidationError).toBe(true);
  });

  it('never surfaces raw HTTP text when the body is not the envelope', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }));

    const error = (await client.request({ path: '/nodes' }).catch((caught) => caught)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.code).toBe('ERR_INTERNAL_SERVER_ERROR');
    expect(error.message).not.toContain('<html>');
  });

  it('clears the session on a 401', async () => {
    const { client, session, fetchMock } = harness();
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'ERR_TOKEN_EXPIRED', message: 'Authentication token has expired' }, 401)
    );

    await expect(client.request({ path: '/nodes' })).rejects.toBeInstanceOf(ApiError);

    expect(session.accessToken).toBeNull();
    expect(session.user).toBeNull();
    expect(session.isAuthenticated).toBe(false);
  });

  it('switches back to a permitted workspace on ERR_UNAUTHORIZED_WORKSPACE_ACCESS', async () => {
    const { client, workspace, fetchMock } = harness();
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          code: 'ERR_UNAUTHORIZED_WORKSPACE_ACCESS',
          message: 'User does not belong to the requested workspace'
        },
        403
      )
    );

    await expect(client.request({ path: '/nodes' })).rejects.toBeInstanceOf(ApiError);

    expect(workspace.currentWorkspaceId).toBe(OTHER_WORKSPACE_ID);
  });

  it('keeps the workspace on another 403', async () => {
    const { client, workspace, fetchMock } = harness();
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'ERR_AUTHORIZATION_FAILED', message: 'Not authorized' }, 403)
    );

    await expect(client.request({ path: '/nodes' })).rejects.toBeInstanceOf(ApiError);

    expect(workspace.currentWorkspaceId).toBe(WORKSPACE_ID);
  });

  it('reads a keyset page and exposes the opaque cursor', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(jsonResponse({ nodes: [{ id: 'a' }], nextCursor: 'cursor-2' }));

    const page = await client.page<{ id: string }>({ path: '/nodes', resourceKey: 'nodes' });

    expect(page.items).toEqual([{ id: 'a' }]);
    expect(page.nextCursor).toBe('cursor-2');
  });

  it('reports the end of a keyset page', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(jsonResponse({ nodes: [], nextCursor: null }));

    const page = await client.page({ path: '/nodes', resourceKey: 'nodes' });

    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});
