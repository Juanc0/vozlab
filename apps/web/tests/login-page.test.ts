import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '$lib/api/client';
import { loginRedirectPath } from '$lib/auth/login-redirect';
import { API_CLIENT_CONTEXT_KEY } from '$lib/state/context';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import LoginPage from '../src/routes/(auth)/login/+page.svelte';

const { navigateTo } = vi.hoisted(() => ({ navigateTo: vi.fn() }));
vi.mock('$lib/auth/redirect', () => ({ navigateTo }));

const { pageState } = vi.hoisted(() => ({
  pageState: { url: new URL('http://localhost:5173/login') }
}));
vi.mock('$app/state', () => ({ page: pageState }));

const BASE_URL = 'http://localhost:3000/api/v1';

function renderLogin(): void {
  const session = new SessionState();
  const workspace = new WorkspaceState();
  const client = new ApiClient({ baseUrl: BASE_URL, session, workspace });

  render(LoginPage, {
    context: new Map<unknown, unknown>([[API_CLIENT_CONTEXT_KEY, client]])
  });
}

async function startLogin(): Promise<string> {
  await fireEvent.click(screen.getByRole('button', { name: /continue with your institution/i }));
  return navigateTo.mock.calls[0]?.[0] as string;
}

describe('the login page', () => {
  beforeEach(() => {
    navigateTo.mockClear();
    pageState.url = new URL('http://localhost:5173/login');
  });

  it('sends the browser to the institutional login', async () => {
    renderLogin();

    const url = await startLogin();

    expect(url).toBe(`${BASE_URL}/auth/login?redirect=%2F`);
  });

  it('builds the redirect from the path the user is on', async () => {
    pageState.url = new URL('http://localhost:5173/proposals');
    renderLogin();

    const url = await startLogin();

    expect(url).toBe(`${BASE_URL}/auth/login?redirect=%2Fproposals`);
  });

  it('keeps the path the guard left behind', async () => {
    pageState.url = new URL('http://localhost:5173/login?next=%2Fdiscussions');
    renderLogin();

    const url = await startLogin();

    expect(url).toBe(`${BASE_URL}/auth/login?redirect=%2Fdiscussions`);
  });

  it('refuses a redirect that leaves the origin', async () => {
    pageState.url = new URL('http://localhost:5173/login?next=https%3A%2F%2Fevil.example%2Fsteal');
    renderLogin();

    const url = await startLogin();

    expect(url).toBe(`${BASE_URL}/auth/login?redirect=%2F`);
  });

  it('refuses a protocol-relative redirect', async () => {
    pageState.url = new URL('http://localhost:5173/login?next=%2F%2Fevil.example');
    renderLogin();

    const url = await startLogin();

    expect(url).toBe(`${BASE_URL}/auth/login?redirect=%2F`);
  });

  it('explains the institutional sign-in and the development alternative', () => {
    renderLogin();

    expect(screen.getByRole('heading', { level: 1, name: /sign in to vozlab/i })).toBeInTheDocument();
    expect(screen.getByText(/does not keep passwords/i)).toBeInTheDocument();
    expect(screen.getByText(/identity provider authenticates you/i)).toBeInTheDocument();
    expect(screen.getByText(/db:mint-token/)).toBeInTheDocument();
    expect(screen.getByText(/docs\/runbook-dev\.md/)).toBeInTheDocument();
  });

  it('does not pretend a camera scan exists on the join page', () => {
    expect(loginRedirectPath('/join', null)).toBe('/');
  });
});

describe('loginRedirectPath', () => {
  it('uses the current path when it is not an auth page', () => {
    expect(loginRedirectPath('/proposals', null)).toBe('/proposals');
  });

  it('falls back to the app root on the auth pages', () => {
    expect(loginRedirectPath('/login', null)).toBe('/');
    expect(loginRedirectPath('/join', null)).toBe('/');
    expect(loginRedirectPath('/auth/callback', null)).toBe('/');
  });

  it('accepts a safe next path and refuses an unsafe one', () => {
    expect(loginRedirectPath('/login', '/proposals')).toBe('/proposals');
    expect(loginRedirectPath('/login', 'https://evil.example')).toBe('/');
    expect(loginRedirectPath('/login', '//evil.example')).toBe('/');
    expect(loginRedirectPath('/login', '/\\evil.example')).toBe('/');
  });
});
