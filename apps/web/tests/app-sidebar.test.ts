import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import AppSidebar from '../src/lib/components/AppSidebar.svelte';
import { contextWithLocale } from './harness/locale';
import { governanceHarness } from './harness/governance';
import {
  API_CLIENT_CONTEXT_KEY,
  SESSION_CONTEXT_KEY,
  WORKSPACE_CONTEXT_KEY
} from '$lib/state/context';

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

const { pageState } = vi.hoisted(() => ({
  pageState: { url: new URL('http://localhost:5173/') }
}));
vi.mock('$app/state', () => ({ page: pageState }));

const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto }));

describe('the navigation column', () => {
  it('carries the mark and the name of the product, and the language at the bottom', () => {
    const { client, session, workspace } = governanceHarness();

    render(AppSidebar, {
      context: contextWithLocale([
        [SESSION_CONTEXT_KEY, session],
        [WORKSPACE_CONTEXT_KEY, workspace],
        [API_CLIENT_CONTEXT_KEY, client]
      ])
    });

    expect(screen.getByText('VozLab')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Idioma' })).toBeInTheDocument();
    expect(screen.queryByRole('banner', { name: 'VozLab' })).not.toBeInTheDocument();
  });

  it('renders the join-with-code control below the workspace selector', () => {
    const { client, session, workspace } = governanceHarness();

    render(AppSidebar, {
      context: contextWithLocale([
        [SESSION_CONTEXT_KEY, session],
        [WORKSPACE_CONTEXT_KEY, workspace],
        [API_CLIENT_CONTEXT_KEY, client]
      ])
    });

    const workspaceSelect = screen.getByRole('combobox', { name: 'Espacio de trabajo' });
    const joinLink = screen.getByRole('link', { name: 'Unirse a un evento' });

    expect(
      workspaceSelect.compareDocumentPosition(joinLink) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('shows workspace-scoped links and request-access, hides admin, for a member', () => {
    const { client, session, workspace } = governanceHarness();

    render(AppSidebar, {
      context: contextWithLocale([
        [SESSION_CONTEXT_KEY, session],
        [WORKSPACE_CONTEXT_KEY, workspace],
        [API_CLIENT_CONTEXT_KEY, client]
      ])
    });

    expect(screen.getByRole('link', { name: 'Grafo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Propuestas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Debates' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Solicitar acceso' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Administración' })).not.toBeInTheDocument();
  });

  it('shows the admin link only for a system admin', () => {
    const { client, session, workspace } = governanceHarness({ authorHash: 'hash' });
    session.user!.systemRole = 'ADMIN';

    render(AppSidebar, {
      context: contextWithLocale([
        [SESSION_CONTEXT_KEY, session],
        [WORKSPACE_CONTEXT_KEY, workspace],
        [API_CLIENT_CONTEXT_KEY, client]
      ])
    });

    expect(screen.getByRole('link', { name: 'Administración' })).toBeInTheDocument();
  });

  it('hides workspace-scoped links when there is no membership, keeps request-access', () => {
    const { client, session, workspace } = governanceHarness();
    workspace.hydrate([]);

    render(AppSidebar, {
      context: contextWithLocale([
        [SESSION_CONTEXT_KEY, session],
        [WORKSPACE_CONTEXT_KEY, workspace],
        [API_CLIENT_CONTEXT_KEY, client]
      ])
    });

    expect(screen.queryByRole('link', { name: 'Grafo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Propuestas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Debates' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Solicitar acceso' })).toBeInTheDocument();
  });

  it('keeps the bottom controls in order: workspace, then language, then sign-out', () => {
    const { client, session, workspace } = governanceHarness();

    render(AppSidebar, {
      context: contextWithLocale([
        [SESSION_CONTEXT_KEY, session],
        [WORKSPACE_CONTEXT_KEY, workspace],
        [API_CLIENT_CONTEXT_KEY, client]
      ])
    });

    const workspaceSelect = screen.getByRole('combobox', { name: 'Espacio de trabajo' });
    const localeSelect = screen.getByRole('combobox', { name: 'Idioma' });
    const signOutButton = screen.getByRole('button', { name: 'Cerrar sesión' });

    // Workspace comes before the language, and the language before the sign-out.
    expect(
      workspaceSelect.compareDocumentPosition(localeSelect) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      localeSelect.compareDocumentPosition(signOutButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('projects the same order onto the rail: workspace, then language, then session', () => {
    const { client, session, workspace } = governanceHarness();

    render(AppSidebar, {
      props: { collapsed: true },
      context: contextWithLocale([
        [SESSION_CONTEXT_KEY, session],
        [WORKSPACE_CONTEXT_KEY, workspace],
        [API_CLIENT_CONTEXT_KEY, client]
      ])
    });

    const workspaceButton = screen.getByTitle('General');
    const localeButton = screen.getByTitle('Idioma');
    const sessionButton = screen.getByTitle('Sesión iniciada');

    expect(
      workspaceButton.compareDocumentPosition(localeButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      localeButton.compareDocumentPosition(sessionButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('folds into a rail of icons: the name becomes the reading of the screen reader, the mark stays', async () => {
    const { client, session, workspace } = governanceHarness();

    render(AppSidebar, {
      props: { collapsed: true },
      context: contextWithLocale([
        [SESSION_CONTEXT_KEY, session],
        [WORKSPACE_CONTEXT_KEY, workspace],
        [API_CLIENT_CONTEXT_KEY, client]
      ])
    });

    // The name is not dropped from the tree: it is the accessible name.
    const brand = screen.getByText('VozLab');
    expect(brand.parentElement).toHaveTextContent('VozLab');

    // The rail keeps three controls; the language keeps its own menu.
    expect(screen.getAllByRole('button', { name: 'Idioma' })).toHaveLength(1);
    expect(screen.queryByRole('combobox', { name: 'Idioma' })).not.toBeInTheDocument();
  });
});
