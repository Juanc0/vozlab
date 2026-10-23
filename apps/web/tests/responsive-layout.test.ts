/**
 * The responsive layout.
 *
 * The layout is **mobile first**: the base is the phone and the
 * breakpoints add the columns. Two pieces of the interface follow the
 * width of the window:
 *
 * - the navigation is a **column** above `md` and a **drawer** below it;
 * - the inspector is a **column** above `xl` and a **sheet** below it.
 *
 * The toggle of the inspector is the **same** control in the two widths: it
 * folds the column in a wide window and it opens the sheet in a narrow one.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '$lib/api/client';
import {
  API_CLIENT_CONTEXT_KEY,
  SESSION_CONTEXT_KEY,
  WORKSPACE_CONTEXT_KEY
} from '$lib/state/context';
import { DEFAULT_PANEL_PREFERENCES } from '$lib/state/panels.svelte';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import AppShell from '$lib/components/AppShell.svelte';
import { NODE_A, WORKSPACE_ID } from './fixtures/graph';
import { contextWithLocale, localeContext } from './harness/locale';
import { setViewportWidth } from './setup';
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

/** Cytoscape needs a `<canvas>`; jsdom has none. The module is mocked. */
const { cytoscapeMock } = vi.hoisted(() => {
  const factory = vi.fn();
  return { cytoscapeMock: Object.assign(factory, { use: vi.fn() }) };
});

vi.mock('cytoscape', () => ({ default: cytoscapeMock }));

const BASE_URL = 'http://localhost:3000/api/v1';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

/** Renders the graph page with the state of a signed-in user. */
function renderPage(): void {
  const session = new SessionState();
  const workspace = new WorkspaceState();
  workspace.hydrate([{ id: WORKSPACE_ID, slug: 'general', name: 'General', role: 'MEMBER' }]);
  workspace.setWorkspace(WORKSPACE_ID);

  const client = new ApiClient({ baseUrl: BASE_URL, session, workspace });

  render(Home, {
    props: { params: {}, data: { apiBaseUrl: BASE_URL, locale: 'es', panels: DEFAULT_PANEL_PREFERENCES } },
    context: contextWithLocale([
      [SESSION_CONTEXT_KEY, session],
      [WORKSPACE_CONTEXT_KEY, workspace],
      [API_CLIENT_CONTEXT_KEY, client]
    ])
  });
}

describe('the responsive layout of the graph page', () => {
  beforeEach(() => {
    sessionStorage.clear();
    goto.mockClear();
    cytoscapeMock.mockReset();
    cytoscapeMock.use.mockReset();
    cytoscapeMock.mockReturnValue({
      on: vi.fn(),
      elements: vi.fn(() => ({ length: 0, remove: vi.fn() })),
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
          return json({ nodes: [NODE_A], nextCursor: null });
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

  it('opens the sheet of the inspector below xl and folds the column above it', async () => {
    // A phone: the inspector is a sheet over the content.
    setViewportWidth(375);
    renderPage();

    // The sheet starts closed: a panel that covers the canvas of a phone
    // the moment it arrives is a panel nobody asked for. The toggle offers
    // to open it.
    const toggle = await screen.findByRole('button', { name: 'Mostrar el inspector' });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await waitFor(() => {
      expect(document.getElementById('vozlab-inspector-sheet')).toHaveAttribute(
        'aria-hidden',
        'true'
      );
    });

    await fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Inspección' })).toBeInTheDocument();
    });

    // The sheet is over the content: it is not the last thing of the page.
    const sheet = screen.getByRole('dialog', { name: 'Inspección' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');

    // The panel is open; its collapse button lives inside it now.
    expect(screen.getByRole('button', { name: 'Ocultar el inspector' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('folds the column of the inspector above xl', async () => {
    // A desktop: the inspector is a column of the page.
    setViewportWidth(1440);
    renderPage();

    // It starts **folded**: the walk through the graph happens without it,
    // and the reader turns it on when they want to read a thing.
    const toggle = await screen.findByRole('button', { name: 'Mostrar el inspector' });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('tab', { name: 'Contenido' })).not.toBeInTheDocument();

    await fireEvent.click(toggle);

    // The column is there, with its tabs.
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Contenido' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('dialog', { name: 'Inspección' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ocultar el inspector' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );

    // And it folds away again.
    await fireEvent.click(screen.getByRole('button', { name: 'Ocultar el inspector' }));

    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: 'Contenido' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Mostrar el inspector' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });
});

describe('the menu of the header', () => {
  it('announces its state and points at the drawer it opens', async () => {
    render(AppShell, {
      props: { title: 'VozLab', navigation: true },
      context: localeContext()
    });

    const menu = screen.getByRole('button', { name: 'Abrir el menú de navegación' });

    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toHaveAttribute('aria-controls', 'vozlab-navigation-drawer');

    await fireEvent.click(menu);

    expect(menu).toHaveAttribute('aria-expanded', 'true');
  });

  it('is not there where there is no navigation to open', () => {
    render(AppShell, { props: { title: 'VozLab' }, context: localeContext() });

    expect(screen.queryByRole('button', { name: 'Abrir el menú de navegación' })).toBeNull();
  });
});
