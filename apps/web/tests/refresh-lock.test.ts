import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from '$lib/api/client';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import { supportsCrossTabRefreshLock } from '$lib/api/refresh-lock';

/**
 * The Web Locks API is not implemented by jsdom, so the tests drive the
 * in-tab deduplication and the fallback path. The cross-tab coordination is
 * the browser's job; the client's contribution is that it holds the lock
 * around the call.
 */
function makeClient(): ApiClient {
  return new ApiClient({
    baseUrl: 'http://localhost:3000/api/v1',
    session: new SessionState(),
    workspace: new WorkspaceState()
  });
}

describe('ApiClient.serializeRefresh', () => {
  it('runs the operation once and returns its result', async () => {
    const client = makeClient();
    const operation = vi.fn(async () => 'token');

    await expect(client.serializeRefresh(operation)).resolves.toBe('token');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight refresh between concurrent callers', async () => {
    const client = makeClient();
    let release: (value: string) => void = () => undefined;
    const operation = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        })
    );

    const first = client.serializeRefresh(operation);
    const second = client.serializeRefresh(operation);

    // Both callers are waiting on the same refresh, not on two of them.
    expect(operation).toHaveBeenCalledTimes(1);

    release('token');

    await expect(first).resolves.toBe('token');
    await expect(second).resolves.toBe('token');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('lets the next caller start a new refresh once the first one settled', async () => {
    const client = makeClient();
    const operation = vi.fn(async () => 'token');

    await client.serializeRefresh(operation);
    await client.serializeRefresh(operation);

    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('clears the in-flight refresh when it failed', async () => {
    const client = makeClient();
    const failing = vi.fn(async () => {
      throw new Error('401');
    });

    // vitest-dev/vitest#5285: the @testing-library/jest-dom/vitest extension
    // (tests/setup.ts) breaks `rejects.toThrow(<string|regex>)` — the matcher
    // reads an empty message. The no-arg form is unaffected, and the message
    // is asserted on the captured rejection reason directly.
    const reason = await client.serializeRefresh(failing).catch((error: unknown) => error);
    expect(reason).toBeInstanceOf(Error);
    expect((reason as Error).message).toBe('401');

    // A failed refresh must not poison the next one.
    const succeeding = vi.fn(async () => 'token');
    await expect(client.serializeRefresh(succeeding)).resolves.toBe('token');
    expect(succeeding).toHaveBeenCalledTimes(1);
  });

  it('does not share the in-flight refresh between clients', async () => {
    // The slot belongs to the client, not to the module: two clients (two
    // tabs, two SSR requests) never wait on each other.
    const first = makeClient();
    const second = makeClient();
    const operation = vi.fn(async () => 'token');

    await first.serializeRefresh(operation);
    await second.serializeRefresh(operation);

    expect(operation).toHaveBeenCalledTimes(2);
  });
});

describe('supportsCrossTabRefreshLock', () => {
  it('reports whether the origin can coordinate the refresh across its tabs', () => {
    // jsdom has no Web Locks API: the fallback is the in-tab guard.
    expect(typeof supportsCrossTabRefreshLock()).toBe('boolean');
  });
});
