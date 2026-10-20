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
import type { AuthUserDto, WorkspaceSummaryDto } from '@vozlab/shared-types';
import JoinPage from '../src/routes/(auth)/join/+page.svelte';
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

const USER: AuthUserDto = {
  id: '44444444-4444-4444-8444-444444444444',
  email: null,
  fullName: null,
  anonymousAlias: 'Curious Otter',
  provider: 'ANONYMOUS_EVENT',
  systemRole: 'USER',
  authorHash: 'b'.repeat(64)
};

const WORKSPACE: WorkspaceSummaryDto = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'general',
  name: 'General',
  role: 'MEMBER'
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

interface Answers {
  readonly join?: () => Response;
  readonly me?: () => Response;
}

function stubFetch(answers: Answers): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith('/auth/event-join')) {
      if (!answers.join) throw new Error(`unexpected request: ${url}`);
      return answers.join();
    }

    if (url.endsWith('/auth/me')) {
      if (!answers.me) throw new Error(`unexpected request: ${url}`);
      return answers.me();
    }

    throw new Error(`unexpected request: ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderJoin(): { session: SessionState; workspace: WorkspaceState } {
  const session = new SessionState();
  const workspace = new WorkspaceState();
  const client = new ApiClient({ baseUrl: BASE_URL, session, workspace });

  render(JoinPage, {
    context: contextWithLocale([
      [SESSION_CONTEXT_KEY, session],
      [WORKSPACE_CONTEXT_KEY, workspace],
      [API_CLIENT_CONTEXT_KEY, client]
    ])
  });

  return { session, workspace };
}

async function submitCode(code: string): Promise<void> {
  await fireEvent.input(screen.getByLabelText(/código del evento/i), { target: { value: code } });
  await fireEvent.submit(screen.getByRole('button', { name: /unirse al evento/i }).closest('form')!);
}

describe('the join page', () => {
  beforeEach(() => {
    goto.mockClear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('surfaces the code and the message of a rejected code', async () => {
    stubFetch({
      join: () =>
        json(
          {
            code: 'ERR_EVENT_EXPIRED',
            message: 'Event code has expired or is invalid'
          },
          400
        )
    });

    renderJoin();
    await submitCode('vle_0123456789abcdefghijkl');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByText('ERR_EVENT_EXPIRED')).toBeInTheDocument();
    expect(screen.getByText('Event code has expired or is invalid')).toBeInTheDocument();
    expect(goto).not.toHaveBeenCalled();
  });

  it('surfaces a full event as well', async () => {
    stubFetch({
      join: () =>
        json({ code: 'ERR_EVENT_FULL', message: 'Event has reached maximum capacity' }, 400)
    });

    renderJoin();
    await submitCode('vle_0123456789abcdefghijkl');

    await waitFor(() => {
      expect(screen.getByText('ERR_EVENT_FULL')).toBeInTheDocument();
    });

    expect(screen.getByText('Event has reached maximum capacity')).toBeInTheDocument();
  });

  it('adopts the session, hydrates the workspaces and enters the app', async () => {
    const fetchMock = stubFetch({
      join: () =>
        json({
          accessToken: 'header.payload.signature',
          expiresAt: '2026-10-19T12:15:00.000Z',
          user: USER
        }),
      me: () => json({ ...USER, workspaces: [WORKSPACE] })
    });

    const { session, workspace } = renderJoin();
    await submitCode('vle_0123456789abcdefghijkl');

    await waitFor(() => {
      expect(goto).toHaveBeenCalledWith('/');
    });

    expect(session.accessToken).toBe('header.payload.signature');
    expect(session.user?.anonymousAlias).toBe('Curious Otter');
    expect(workspace.workspaces).toEqual([WORKSPACE]);
    expect(workspace.currentWorkspaceId).toBe(WORKSPACE.id);
    expect(sessionStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBe(WORKSPACE.id);

    const joinCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).endsWith('/auth/event-join')
    );
    expect(joinCall).toBeDefined();
    expect(JSON.parse(String((joinCall?.[1] as RequestInit).body))).toEqual({
      code: 'vle_0123456789abcdefghijkl'
    });
  });

  it('needs no camera: the code is typed in a text field', () => {
    renderJoin();

    const input = screen.getByLabelText(/código del evento/i) as HTMLInputElement;

    expect(input.tagName).toBe('INPUT');
    expect(input.type).toBe('text');
    expect(screen.getByText(/no hay escaneo con la cámara/i)).toBeInTheDocument();
  });
});
