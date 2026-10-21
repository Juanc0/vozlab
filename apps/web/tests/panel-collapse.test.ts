/**
 * The **panels** of the application.
 *
 * Three of them fold, and the reader decides how the screen looks:
 *
 * - the **navigation** folds into a rail of 56 pixels, and the sections
 *   keep their accessible names;
 * - the **inspector** is folded by default: the walk through the graph
 *   happens without it;
 * - the **root picker** is folded by default too: it is a control of the
 *   toolbar that opens it, and the panel it opens has a **search**.
 *
 * The state of the three lives in a **cookie** that the **server** reads,
 * so the first paint is already the state the reader left behind.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUserDto } from '@vozlab/shared-types';
import { ApiClient } from '$lib/api/client';
import AppShell from '$lib/components/AppShell.svelte';
import AppSidebar from '$lib/components/AppSidebar.svelte';
import RootPicker from '$lib/components/RootPicker.svelte';
import {
  API_CLIENT_CONTEXT_KEY,
  PANELS_CONTEXT_KEY,
  SESSION_CONTEXT_KEY,
  WORKSPACE_CONTEXT_KEY
} from '$lib/state/context';
import {
  DEFAULT_PANEL_PREFERENCES,
  PANELS_COOKIE_NAME
} from '$lib/state/panels.svelte';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import { handle } from '../src/hooks.server';
import { load } from '../src/routes/+layout.server';
import { NODE_A, NODE_B, WORKSPACE_ID } from './fixtures/graph';
import { contextWithLocale, localeContext, panelsContext } from './harness/locale';
import Home from '../src/routes/(app)/+page.svelte';

const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto }));

const { pageState } = vi.hoisted(() => ({
  pageState: { url: new URL('http://localhost:5173/') }
}));
vi.mock('$app/state', () => ({ page: pageState }));

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

// The environment of the runtime is read by the layout load; the test does
// not care about it.
vi.mock('$env/dynamic/public', () => ({ env: {} }));

/** Cytoscape needs a `<canvas>`; jsdom has none. The module is mocked. */
const { cytoscapeMock } = vi.hoisted(() => {
  const factory = vi.fn();
  return { cytoscapeMock: Object.assign(factory, { use: vi.fn() }) };
});

vi.mock('cytoscape', () => ({ default: cytoscapeMock }));

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

/** The context of a screen with a signed-in user. */
function signedInContext(): Map<unknown, unknown> {
  const session = new SessionState();
  session.setUser(USER);

  const workspace = new WorkspaceState();
  workspace.hydrate([{ id: WORKSPACE_ID, slug: 'general', name: 'General', role: 'MEMBER' }]);
  workspace.setWorkspace(WORKSPACE_ID);

  const client = new ApiClient({ baseUrl: BASE_URL, session, workspace });

  return contextWithLocale([
    [SESSION_CONTEXT_KEY, session],
    [WORKSPACE_CONTEXT_KEY, workspace],
    [API_CLIENT_CONTEXT_KEY, client]
  ]);
}

/** Renders the graph page with the state of a signed-in user. */
function renderPage(): void {
  render(Home, {
    props: {
      params: {},
      data: { apiBaseUrl: BASE_URL, locale: 'es', panels: DEFAULT_PANEL_PREFERENCES }
    },
    context: signedInContext()
  });
}

describe('the rail of the navigation', () => {
  it('keeps the accessible name of every section', () => {
    render(AppSidebar, {
      props: { collapsible: true, collapsed: true },
      context: signedInContext()
    });

    // The rail is not a hiding: the name of the section is still announced.
    expect(screen.getByRole('link', { name: 'Grafo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Propuestas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Debates' })).toBeInTheDocument();

    // And it is the tooltip of the icon.
    expect(screen.getByRole('link', { name: 'Grafo' })).toHaveAttribute('title', 'Grafo');
  });

  it('is 56 pixels wide, and the column of the navigation is 230', () => {
    // The width is a token of the design system, not a number written in a
    // component.
    const stylesheet = readFileSync(join(process.cwd(), 'src', 'app.css'), 'utf8');

    expect(stylesheet).toContain('--sidebar-rail-width: 56px');
    expect(stylesheet).toContain('--sidebar-width: 230px');
  });

  it('offers the workspace and the session without dropping them', async () => {
    render(AppSidebar, {
      props: { collapsible: true, collapsed: true },
      context: signedInContext()
    });

    // The workspace is a control that opens its menu.
    const workspace = screen.getByRole('button', { name: 'Espacio de trabajo: General' });
    expect(workspace).toHaveAttribute('aria-expanded', 'false');

    await fireEvent.click(workspace);

    // The menu holds the very same selector: a real form with the full
    // names of the workspaces.
    const select = (await screen.findByLabelText('Espacio de trabajo')) as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(Array.from(select.options).map((option) => option.textContent?.trim())).toEqual([
      'General'
    ]);

    // And the session keeps its identity readable.
    expect(screen.getByRole('button', { name: 'Sesión de Ada Lovelace' })).toBeInTheDocument();
  });

  it('unfolds the column when the reader asks for it', async () => {
    const panels = panelsContext({ navCollapsed: true });

    const session = new SessionState();
    const workspace = new WorkspaceState();

    render(AppSidebar, {
      props: { collapsible: true, collapsed: true },
      context: contextWithLocale([
        [SESSION_CONTEXT_KEY, session],
        [WORKSPACE_CONTEXT_KEY, workspace],
        [
          API_CLIENT_CONTEXT_KEY,
          new ApiClient({ baseUrl: BASE_URL, session, workspace })
        ],
        [PANELS_CONTEXT_KEY, panels]
      ])
    });

    const toggle = screen.getByRole('button', { name: 'Expandir la navegación' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await fireEvent.click(toggle);

    // The preference is kept in the cookie — never in the storage of the
    // browser.
    expect(panels.navCollapsed).toBe(false);
    expect(document.cookie).toContain(PANELS_COOKIE_NAME);
    expect(window.localStorage.length).toBe(0);
  });
});

describe('the language of the interface', () => {
  it('stays reachable when the navigation is folded', () => {
    // The language lives in the bar of the shell, not in the navigation
    // column: it changes the whole application, and folding the navigation
    // never touches it.
    render(AppShell, {
      props: { title: 'VozLab', navigation: true },
      context: localeContext()
    });

    const select = screen.getByLabelText('Idioma') as HTMLSelectElement;

    expect(select.tagName).toBe('SELECT');
    expect(Array.from(select.options).map((option) => option.textContent?.trim())).toEqual([
      'Español',
      'English'
    ]);
  });
});

describe('the inspector of the workspace', () => {
  beforeEach(() => {
    sessionStorage.clear();
    goto.mockClear();
    cytoscapeMock.mockReset();
    cytoscapeMock.use.mockReset();
    cytoscapeMock.mockReturnValue({
      on: vi.fn(),
      elements: vi.fn(() => ({ length: 0, remove: vi.fn(), forEach: vi.fn() })),
      edges: vi.fn(() => ({ length: 0, forEach: vi.fn() })),
      add: vi.fn(),
      layout: vi.fn(() => ({ run: vi.fn(), one: vi.fn() })),
      nodes: vi.fn(() => ({ length: 0, removeClass: vi.fn(), forEach: vi.fn() })),
      getElementById: vi.fn(() => ({ length: 0, addClass: vi.fn() })),
      destroy: vi.fn(),
      resize: vi.fn()
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/nodes')) {
          return json({ nodes: [NODE_A, NODE_B], nextCursor: null });
        }

        if (url.includes('/ontology')) {
          return json({ classes: [], properties: [] });
        }

        return json({});
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is folded by default, and the toggle opens it', async () => {
    renderPage();

    const toggle = await screen.findByRole('button', { name: 'Mostrar el inspector' });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('tab', { name: 'Contenido' })).not.toBeInTheDocument();

    await fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Contenido' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Ocultar el inspector' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('leaves the text alternative of the canvas alone', async () => {
    renderPage();

    // The list is the other half of the workspace: it does not depend on
    // the inspector.
    await fireEvent.click(await screen.findByRole('button', { name: 'Lista' }));

    await waitFor(() => {
      expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
    });
  });
});

describe('the panel of the root picker', () => {
  it('is folded by default, and the control of the toolbar opens it', async () => {
    renderPage();

    const toggle = await screen.findByRole('button', { name: 'Raíz' });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // The panel is folded: it stays in the document — the control points at
    // it — but it is not shown.
    const panel = document.getElementById('vozlab-root-picker');
    expect(panel?.className).toContain('hidden');

    await fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Nodo raíz' })).toBeInTheDocument();
    });
    expect(document.getElementById('vozlab-root-picker')?.className).not.toContain('hidden');
    expect(screen.getByRole('button', { name: 'Raíz' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('searches the nodes of the list, with the accents and without', async () => {
    render(RootPicker, {
      props: {
        nodes: [
          { ...NODE_A, title: 'Análisis de la muestra' },
          { ...NODE_B, title: 'Ideación de un curso' }
        ]
      },
      context: localeContext()
    });

    const search = screen.getByLabelText('Buscar un nodo');

    // Both of them are there.
    expect(screen.getByRole('button', { name: 'Análisis de la muestra' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ideación de un curso' })).toBeInTheDocument();

    // The search is case- and accent-insensitive.
    await fireEvent.input(search, { target: { value: 'analisis' } });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Ideación de un curso' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Análisis de la muestra' })).toBeInTheDocument();

    // The count of what is left is said out loud.
    expect(screen.getByRole('status')).toHaveTextContent('Nodos que coinciden: 1');

    // An empty result is a sentence, and not an error.
    await fireEvent.input(search, { target: { value: 'telepatía' } });

    await waitFor(() => {
      expect(screen.getByText(/Ningún nodo coincide/)).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // And an empty search is not an error either.
    await fireEvent.input(search, { target: { value: '' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ideación de un curso' })).toBeInTheDocument();
    });
  });
});

describe('the first paint of the server', () => {
  it('reads the state of the panels from the cookie of the visitor', async () => {
    // The browser sends the cookie encoded; the server reads it decoded.
    const cookie = JSON.stringify({
      navCollapsed: true,
      inspectorCollapsed: true,
      rootCollapsed: true
    });

    const locals: { panels?: unknown } = {};

    await handle({
      event: { cookies: { get: () => cookie }, locals },
      resolve: async () => new Response('<!doctype html><html lang="es"></html>')
    } as never);

    // The hook reads the cookie…
    expect(locals.panels).toEqual({
      navCollapsed: true,
      inspectorCollapsed: true,
      rootCollapsed: true
    });

    // …and the layout hands it to the document: the first paint is already
    // the state the reader left behind, with no flash of a panel that opens
    // and closes again after the hydration.
    const result = load({ cookies: { get: () => cookie }, locals } as never) as {
      panels: unknown;
    };

    expect(result.panels).toEqual({
      navCollapsed: true,
      inspectorCollapsed: true,
      rootCollapsed: true
    });
  });

  it('falls back to the default when there is no cookie', () => {
    const result = load({ cookies: { get: () => undefined }, locals: {} } as never) as {
      panels: unknown;
    };

    expect(result.panels).toEqual(DEFAULT_PANEL_PREFERENCES);
  });
});
