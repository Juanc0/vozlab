import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eventJoin, fetchMe, loginUrl, logout, refreshSession } from '$lib/api/auth';
import { ApiClient } from '$lib/api/client';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import type { AuthUserDto } from '@vozlab/shared-types';

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

function harness() {
  const session = new SessionState();
  session.setSession({
    accessToken: 'header.payload.signature',
    expiresAt: '2026-10-19T12:15:00.000Z',
    user: USER
  });

  const workspace = new WorkspaceState();
  workspace.hydrate([{ id: '11111111-1111-4111-8111-111111111111', slug: 'general', name: 'General', role: 'MEMBER' }]);
  workspace.setWorkspace('11111111-1111-4111-8111-111111111111');

  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  return { client: new ApiClient({ baseUrl: BASE_URL, session, workspace }), fetchMock, session };
}

function headersOf(fetchMock: ReturnType<typeof vi.fn>, call = 0): Headers {
  const init = fetchMock.mock.calls[call]?.[1] as RequestInit | undefined;
  return new Headers(init?.headers);
}

describe('auth api', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refreshes the session with the cookie alone', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'new-token',
          expiresAt: '2026-10-19T12:30:00.000Z',
          user: USER
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const session = await refreshSession(client);

    expect(session.accessToken).toBe('new-token');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE_URL}/auth/refresh`);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('POST');
    expect(headersOf(fetchMock).get('Authorization')).toBeNull();
    expect(headersOf(fetchMock).get('X-Workspace-ID')).toBeNull();
  });

  it('reads /auth/me without the workspace header', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ...USER, workspaces: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );

    const me = await fetchMe(client);

    expect(me.workspaces).toEqual([]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE_URL}/auth/me`);
    expect(headersOf(fetchMock).get('Authorization')).toBe('Bearer header.payload.signature');
    expect(headersOf(fetchMock).get('X-Workspace-ID')).toBeNull();
  });

  it('logs out and returns the IdP end_session URL', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ endSessionUrl: 'https://idp.example/end_session?client_id=x' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    await expect(logout(client)).resolves.toBe('https://idp.example/end_session?client_id=x');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE_URL}/auth/logout`);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('POST');
  });

  it('joins an event with the code alone', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'event-token',
          expiresAt: '2026-10-19T12:15:00.000Z',
          user: USER
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const session = await eventJoin(client, { code: '  vle_0123456789abcdefghijkl  ' });

    expect(session.accessToken).toBe('event-token');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE_URL}/auth/event-join`);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('POST');
    expect(headersOf(fetchMock).get('Authorization')).toBeNull();
    expect(headersOf(fetchMock).get('X-Workspace-ID')).toBeNull();
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      code: 'vle_0123456789abcdefghijkl'
    });
  });

  it('sends the alias of an event join when there is one', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'event-token',
          expiresAt: '2026-10-19T12:15:00.000Z',
          user: USER
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    await eventJoin(client, { code: 'vle_0123456789abcdefghijkl', alias: '  Curious Otter  ' });

    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      code: 'vle_0123456789abcdefghijkl',
      alias: 'Curious Otter'
    });
  });

  it('builds the login URL with a same-origin redirect', () => {
    const { client } = harness();

    expect(loginUrl(client, '/proposals')).toBe(
      `${BASE_URL}/auth/login?redirect=%2Fproposals`
    );
    expect(loginUrl(client)).toBe(`${BASE_URL}/auth/login?redirect=%2F`);
  });

  it('refuses a redirect that leaves the origin', () => {
    const { client } = harness();

    expect(loginUrl(client, 'https://evil.example/steal')).toBe(
      `${BASE_URL}/auth/login?redirect=%2F`
    );
    expect(loginUrl(client, '//evil.example')).toBe(`${BASE_URL}/auth/login?redirect=%2F`);
  });
});
