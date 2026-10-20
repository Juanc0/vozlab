import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from '$lib/api/client';
import { OfflineError } from '$lib/api/errors';
import { describeFailure } from '$lib/api/failure';
import { connectivityState } from '$lib/pwa/connectivity.svelte';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

/** A client whose network is stubbed. */
function buildClient(): { client: ApiClient; fetchMock: ReturnType<typeof vi.fn> } {
  const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);

  const client = new ApiClient({
    baseUrl: 'http://localhost:3000/api/v1',
    session: new SessionState(),
    workspace: new WorkspaceState()
  });

  return { client, fetchMock };
}

describe('the write block of the offline mode', () => {
  beforeEach(() => {
    connectivityState.attach();
    window.dispatchEvent(new Event('online'));
  });

  afterEach(() => {
    window.dispatchEvent(new Event('online'));
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('refuses a write before the request leaves the app', async () => {
    const { client, fetchMock } = buildClient();

    window.dispatchEvent(new Event('offline'));

    await expect(
      client.request({ method: 'POST', path: '/interactions', body: { targetId: 'x' } })
    ).rejects.toBeInstanceOf(OfflineError);

    // Nothing was sent: the network was never touched.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses every kind of write', async () => {
    const { client, fetchMock } = buildClient();

    window.dispatchEvent(new Event('offline'));

    const writes: { method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string }[] = [
      { method: 'POST', path: '/nodes' },
      { method: 'POST', path: '/edges' },
      { method: 'PUT', path: '/proposals/1/approve' },
      { method: 'PUT', path: '/proposals/1/reject' },
      { method: 'PUT', path: '/proposals/1/auto-apply' },
      { method: 'POST', path: '/discussions' },
      { method: 'POST', path: '/discussions/1/posts' },
      { method: 'PUT', path: '/discussions/1/close' },
      { method: 'DELETE', path: '/discussions/posts/1' },
      { method: 'POST', path: '/interactions' }
    ];

    for (const write of writes) {
      await expect(client.request(write)).rejects.toBeInstanceOf(OfflineError);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets the reads through: the offline mode is read-only, not blind', async () => {
    const { client, fetchMock } = buildClient();

    window.dispatchEvent(new Event('offline'));

    await client.request({ path: '/nodes' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/nodes');
  });

  it('sends the writes again once the browser is back', async () => {
    const { client, fetchMock } = buildClient();

    window.dispatchEvent(new Event('offline'));
    await expect(client.request({ method: 'POST', path: '/interactions' })).rejects.toBeInstanceOf(
      OfflineError
    );

    window.dispatchEvent(new Event('online'));
    await client.request({ method: 'POST', path: '/interactions' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('describes the refusal with a code of its own and a message that says why', () => {
    const failure = describeFailure(new OfflineError());

    expect(failure.code).toBe('ERR_OFFLINE');
    expect(failure.message).toMatch(/offline/i);
    expect(failure.message).toMatch(/not sent/i);
  });
});
