/**
 * The admin join-code client (v6/TASK-04, B6): the PATCH must hit the code's
 * own route with the workspace header and carry only the patched attributes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '$lib/api/client';
import { updateJoinCode } from '$lib/api/admin';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import { WORKSPACE_ID } from './fixtures/graph';

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

const BASE_URL = 'http://localhost:3000/api/v1';
const CODE_ID = 'code-1';

function harness(): { client: ApiClient; fetchMock: ReturnType<typeof vi.fn> } {
  const session = new SessionState();
  session.setSession({
    accessToken: 'token',
    expiresAt: '2026-11-01T00:00:00.000Z',
    user: {
      id: 'user-1',
      email: 'ada@example.edu',
      fullName: 'Ada Lovelace',
      anonymousAlias: null,
      provider: 'OIDC_INSTITUTIONAL',
      systemRole: 'USER',
      authorHash: 'a'.repeat(64)
    }
  });
  const workspace = new WorkspaceState();
  workspace.hydrate([{ id: WORKSPACE_ID, slug: 'general', name: 'General', role: 'ADMIN' }]);
  workspace.setWorkspace(WORKSPACE_ID);

  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  return { client: new ApiClient({ baseUrl: BASE_URL, session, workspace }), fetchMock };
}

describe('updateJoinCode', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('PATCHes the code route with the workspace header and the patch body', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ id: CODE_ID, label: 'meetup-2', autoApprove: true }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    await updateJoinCode(client, WORKSPACE_ID, CODE_ID, {
      label: 'meetup-2',
      autoApprove: true
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/workspaces/${WORKSPACE_ID}/join-codes/${CODE_ID}`);
    expect(init.method).toBe('PATCH');
    const headers = init.headers as Headers;
    expect(headers.get('x-workspace-id')).toBe(WORKSPACE_ID);
    expect(headers.get('authorization')).toBe('Bearer token');
    expect(JSON.parse(String(init.body))).toEqual({ label: 'meetup-2', autoApprove: true });
  });

  it('sends the explicit nulls that clear the expiry and the cap', async () => {
    const { client, fetchMock } = harness();
    fetchMock.mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));

    await updateJoinCode(client, WORKSPACE_ID, CODE_ID, {
      expiresAt: null,
      maxUses: null
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ expiresAt: null, maxUses: null });
  });
});
