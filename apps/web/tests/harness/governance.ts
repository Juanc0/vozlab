/**
 * The harness of the governance tests.
 *
 * It renders a component with the application state in the Svelte context —
 * the session, the workspace and the API client — exactly as the root
 * layout does.
 */

import { render } from '@testing-library/svelte';
import { vi } from 'vitest';
import type { WorkspaceRole } from '@vozlab/shared-types';
import { ApiClient } from '$lib/api/client';
import {
  API_CLIENT_CONTEXT_KEY,
  SESSION_CONTEXT_KEY,
  WORKSPACE_CONTEXT_KEY
} from '$lib/state/context';
import { contextWithLocale } from './locale';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import { WORKSPACE_ID } from '../fixtures/graph';

export const BASE_URL = 'http://localhost:3000/api/v1';

export interface HarnessOptions {
  /**
   * The pseudonym of the signed-in user. `null` (the default) means there
   * is no session at all.
   */
  readonly authorHash?: string | null;
  /** The role of the signed-in user in the workspace. */
  readonly role?: WorkspaceRole;
  /**
   * The stubbed `fetch`. It must be configured **before** the screen is
   * rendered: the first read goes out while the component mounts.
   */
  readonly fetch?: ReturnType<typeof vi.fn>;
}

/** The state of a rendered governance screen. */
export interface Harness {
  readonly client: ApiClient;
  readonly session: SessionState;
  readonly workspace: WorkspaceState;
  readonly fetchMock: ReturnType<typeof vi.fn>;
}

/** The state of a rendered screen, with the re-render of its props. */
export interface RenderedHarness extends Harness {
  /** Re-renders the component with new props. */
  readonly rerender: (props: Record<string, unknown>) => Promise<void>;
}

/** Builds the state of a tab and stubs the network. */
export function governanceHarness(options: HarnessOptions = {}): Harness {
  const session = new SessionState();
  const workspace = new WorkspaceState();
  workspace.hydrate([
    { id: WORKSPACE_ID, slug: 'general', name: 'General', role: options.role ?? 'MEMBER' }
  ]);
  workspace.setWorkspace(WORKSPACE_ID);

  const authorHash = options.authorHash ?? null;
  if (authorHash !== null) {
    session.setSession({
      accessToken: 'test-access-token',
      expiresAt: '2026-10-20T12:00:00.000Z',
      user: {
        id: '55555555-5555-4555-8555-555555555555',
        email: 'ada@example.edu',
        fullName: 'Ada Lovelace',
        anonymousAlias: null,
        provider: 'OIDC_INSTITUTIONAL',
        systemRole: 'USER',
        authorHash
      }
    });
  }

  const fetchMock = options.fetch ?? vi.fn(async () => json({}));
  vi.stubGlobal('fetch', fetchMock);

  const client = new ApiClient({ baseUrl: BASE_URL, session, workspace });

  return { client, session, workspace, fetchMock };
}

/** Renders a component with the application state in the context. */
export function renderGovernance(
  component: Parameters<typeof render>[0],
  options: HarnessOptions = {},
  props: Record<string, unknown> = {}
): RenderedHarness {
  const { client, session, workspace, fetchMock } = governanceHarness(options);

  const result = render(component, {
    props,
    context: contextWithLocale([
      [SESSION_CONTEXT_KEY, session],
      [WORKSPACE_CONTEXT_KEY, workspace],
      [API_CLIENT_CONTEXT_KEY, client]
    ])
  } as Parameters<typeof render>[1]);

  return {
    client,
    session,
    workspace,
    fetchMock,
    rerender: (next: Record<string, unknown>) => result.rerender(next)
  };
}

/** A JSON response. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

/** The URLs the stub was asked for. */
export function requestedUrls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}
