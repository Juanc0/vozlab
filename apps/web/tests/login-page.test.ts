import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '$lib/api/client';
import { loginRedirectPath } from '$lib/auth/login-redirect';
import {
  API_CLIENT_CONTEXT_KEY,
  SESSION_CONTEXT_KEY,
  WORKSPACE_CONTEXT_KEY
} from '$lib/state/context';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import LoginPage from '../src/routes/(auth)/login/+page.svelte';
import { contextWithLocale } from './harness/locale';

const { navigateTo } = vi.hoisted(() => ({ navigateTo: vi.fn() }));
vi.mock('$lib/auth/redirect', () => ({ navigateTo }));

const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto }));

const { envState } = vi.hoisted(() => ({
  envState: { isDevelopmentBuild: (): boolean => true }
}));
vi.mock('$lib/config/environment', () => envState);

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
    context: contextWithLocale([
      [API_CLIENT_CONTEXT_KEY, client],
      [SESSION_CONTEXT_KEY, session],
      [WORKSPACE_CONTEXT_KEY, workspace]
    ])
  });
}

async function startLogin(): Promise<string> {
  await fireEvent.click(screen.getByRole('button', { name: /cuenta local/i }));
  return navigateTo.mock.calls[0]?.[0] as string;
}

describe('the login page', () => {
  beforeEach(() => {
    navigateTo.mockClear();
    goto.mockClear();
    envState.isDevelopmentBuild = () => true;
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

  it('does not pretend a camera scan exists on the join page', () => {
    expect(loginRedirectPath('/join', null)).toBe('/');
  });
});

describe('the login page in a development build', () => {
  beforeEach(() => {
    navigateTo.mockClear();
    goto.mockClear();
    envState.isDevelopmentBuild = () => true;
    pageState.url = new URL('http://localhost:5173/login');
  });

  it('offers the development sign-in', () => {
    renderLogin();

    expect(screen.getByRole('heading', { name: /acceso de desarrollo/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/token de desarrollo/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /entrar con esta identidad/i })).toBeInTheDocument();
  });

  it('explains why the event code is not enough', () => {
    renderLogin();

    expect(screen.getByText(/ni aprobar una propuesta ni aplicarla automáticamente/i)).toBeInTheDocument();
    expect(screen.getByText(/nunca se escribe en el almacenamiento del navegador/i)).toBeInTheDocument();
  });

  it('lists the commands that mint a token for each identity', () => {
    renderLogin();

    expect(screen.getByText(/--as maintainer/)).toBeInTheDocument();
    expect(screen.getByText(/--as moderator/)).toBeInTheDocument();
    expect(screen.getByText(/--as member/)).toBeInTheDocument();
  });

  it('refuses a text that is not a token without calling the API', async () => {
    renderLogin();

    await fireEvent.input(screen.getByLabelText(/token de desarrollo/i), {
      target: { value: 'not a token' }
    });
    await fireEvent.click(screen.getByRole('button', { name: /entrar con esta identidad/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no es un token bearer/i);
    expect(goto).not.toHaveBeenCalled();
  });
});

describe('the login page in a production build', () => {
  beforeEach(() => {
    navigateTo.mockClear();
    goto.mockClear();
    envState.isDevelopmentBuild = () => false;
    pageState.url = new URL('http://localhost:5173/login');
  });

  it('has no development sign-in at all', () => {
    renderLogin();

    expect(screen.queryByRole('heading', { name: /acceso de desarrollo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /token de desarrollo/i })).not.toBeInTheDocument();
  });

  it('explains the institutional sign-in and the development alternative', () => {
    renderLogin();

    expect(screen.getByRole('heading', { level: 1, name: /iniciar sesión en vozlab/i })).toBeInTheDocument();
    expect(screen.getByText(/no guarda contraseñas/i)).toBeInTheDocument();
    expect(screen.getByText(/proveedor de identidad de tu institución te autentica/i)).toBeInTheDocument();
    expect(screen.getByText(/db:mint-token/)).toBeInTheDocument();
    expect(screen.getByText(/docs\/runbook-dev\.md/)).toBeInTheDocument();
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
