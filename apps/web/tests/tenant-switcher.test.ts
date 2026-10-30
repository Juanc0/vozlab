/**
 * The tenant switcher (v6/TASK-01: the web loop of `switch-tenant`).
 *
 * It renders only when the session carries a `globalUserId` with more than
 * one ACTIVE linked tenant; choosing one calls
 * `POST /auth/switch-tenant` → serialized `POST /auth/refresh` →
 * `GET /auth/me` (the memberships of the destination tenant).
 */

import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TenantSwitcher from '$lib/components/TenantSwitcher.svelte';
import { ApiClient } from '$lib/api/client';
import {
  API_CLIENT_CONTEXT_KEY,
  SESSION_CONTEXT_KEY,
  WORKSPACE_CONTEXT_KEY
} from '$lib/state/context';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import { contextWithLocale } from './harness/locale';
import type { AuthUserDto } from '@vozlab/shared-types';

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto }));

const BASE_URL = 'http://localhost:3000/api/v1';
const GID = '99999999-9999-4999-8999-999999999999';
const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const WS_A = '33333333-3333-4333-8333-333333333333';
const WS_B = '44444444-4444-4444-8444-444444444444';

const USER: AuthUserDto = {
  id: '55555555-5555-4555-8555-555555555555',
  fullName: 'Ada Lovelace',
  anonymousAlias: null,
  provider: 'OIDC_INSTITUTIONAL',
  systemRole: 'USER',
  authorHash: 'a'.repeat(64)
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

/** The answers of the router/tenant APIs for a two-institution identity. */
function route(
  url: string,
  calls: string[]
): Response {
  calls.push(url.replace(BASE_URL, ''));

  if (url.includes('/auth/resolve-tenants')) {
    return json({
      tenants: [
        { id: TENANT_A, slug: 'sabana', status: 'ACTIVE' },
        { id: TENANT_B, slug: 'local', status: 'ACTIVE' }
      ]
    });
  }
  if (url.endsWith('/auth/switch-tenant')) {
    return json({ tenantId: TENANT_B });
  }
  if (url.endsWith('/auth/refresh')) {
    return json({
      accessToken: 'new-token',
      expiresAt: '2026-11-01T00:00:00.000Z',
      user: USER
    });
  }
  if (url.endsWith('/auth/me')) {
    return json({
      ...USER,
      workspaces: [{ id: WS_B, slug: 'general', name: 'General', role: 'MEMBER' }],
      globalUserId: GID,
      tenantId: TENANT_B
    });
  }
  throw new Error(`unexpected request: ${url}`);
}

function harness(): {
  session: SessionState;
  workspace: WorkspaceState;
  calls: string[];
} {
  const session = new SessionState();
  session.setSession({
    accessToken: 'old-token',
    expiresAt: '2026-10-20T00:00:00.000Z',
    user: USER
  });
  session.globalUserId = GID;
  session.currentTenantId = TENANT_A;

  const workspace = new WorkspaceState();
  workspace.hydrate([
    { id: WS_A, slug: 'general', name: 'General (sabana)', role: 'ADMIN' }
  ]);
  workspace.setWorkspace(WS_A);

  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
    route(String(input), calls)
  ));

  const client = new ApiClient({ baseUrl: BASE_URL, session, workspace });
  render(TenantSwitcher, {
    context: contextWithLocale([
      [SESSION_CONTEXT_KEY, session],
      [WORKSPACE_CONTEXT_KEY, workspace],
      [API_CLIENT_CONTEXT_KEY, client]
    ])
  });

  return { session, workspace, calls };
}

describe('TenantSwitcher', () => {
  beforeEach(() => {
    sessionStorage.clear();
    goto.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stays hidden when the identity has no global link', async () => {
    const session = new SessionState();
    session.setSession({
      accessToken: 't',
      expiresAt: '2026-11-01T00:00:00.000Z',
      user: USER
    });
    const workspace = new WorkspaceState();
    vi.stubGlobal('fetch', vi.fn(async () => json({ tenants: [] })));

    render(TenantSwitcher, {
      context: contextWithLocale([
        [SESSION_CONTEXT_KEY, session],
        [WORKSPACE_CONTEXT_KEY, workspace],
        [API_CLIENT_CONTEXT_KEY, new ApiClient({ baseUrl: BASE_URL, session, workspace })]
      ])
    });

    expect(screen.queryByLabelText('Institución')).not.toBeInTheDocument();
  });

  it('renders the ACTIVE linked tenants when there is more than one', async () => {
    harness();
    const select = await screen.findByLabelText('Institución');
    expect(select).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'sabana' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'local' })).toBeInTheDocument();
  });

  it('switches tenant without re-authentication and reloads the memberships', async () => {
    const { session, workspace, calls } = harness();
    const select = (await screen.findByLabelText('Institución')) as HTMLSelectElement;
    expect(select.value).toBe(TENANT_A);

    await fireEvent.change(select, { target: { value: TENANT_B } });

    // The full loop ran, in order.
    await vi.waitFor(() => {
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.stringContaining('/auth/switch-tenant'),
          expect.stringContaining('/auth/refresh'),
          expect.stringContaining('/auth/me')
        ])
      );
      expect(goto).toHaveBeenCalledWith('/');
    });
    const order = calls.filter((c) =>
      c.includes('/auth/switch-tenant') || c.includes('/auth/refresh') || c.includes('/auth/me')
    );
    expect(order).toEqual([
      expect.stringContaining('/auth/switch-tenant'),
      expect.stringContaining('/auth/refresh'),
      expect.stringContaining('/auth/me')
    ]);

    // The session moved to the destination tenant.
    expect(session.accessToken).toBe('new-token');
    expect(session.currentTenantId).toBe(TENANT_B);
    // The workspace of the previous tenant was dropped and the destination
    // membership became active (hydrate + setWorkspace in loadMemberships).
    expect(workspace.currentWorkspaceId).toBe(WS_B);
    expect(workspace.workspaces).toHaveLength(1);
  });

  it('reverts the select and reports the error when the switch fails', async () => {
    const session = new SessionState();
    session.setSession({
      accessToken: 'old-token',
      expiresAt: '2026-11-01T00:00:00.000Z',
      user: USER
    });
    session.globalUserId = GID;
    session.currentTenantId = TENANT_A;
    const workspace = new WorkspaceState();

    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/resolve-tenants')) {
        return json({
          tenants: [
            { id: TENANT_A, slug: 'sabana', status: 'ACTIVE' },
            { id: TENANT_B, slug: 'local', status: 'ACTIVE' }
          ]
        });
      }
      if (url.endsWith('/auth/switch-tenant')) {
        return json({ code: 'ERR_TENANT_NOT_PROVISIONED', message: 'nope' }, 404);
      }
      calls.push(url);
      throw new Error(`unexpected request: ${url}`);
    }));

    render(TenantSwitcher, {
      context: contextWithLocale([
        [SESSION_CONTEXT_KEY, session],
        [WORKSPACE_CONTEXT_KEY, workspace],
        [API_CLIENT_CONTEXT_KEY, new ApiClient({ baseUrl: BASE_URL, session, workspace })]
      ])
    });

    const select = (await screen.findByLabelText('Institución')) as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: TENANT_B } });

    await vi.waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(select.value).toBe(TENANT_A);
    expect(session.currentTenantId).toBe(TENANT_A);
  });
});
