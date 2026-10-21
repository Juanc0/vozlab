/**
 * The graph page as a **workspace**.
 *
 * The page is not a document that scrolls: it is the window. The canvas is
 * the whole area, with an even ground, and the panels **float** over it —
 * they are absolutely positioned, so opening one does not change the size
 * of the picture.
 *
 * The list is the text alternative of the canvas and it is one click away.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '$lib/api/client';
import {
  API_CLIENT_CONTEXT_KEY,
  SESSION_CONTEXT_KEY,
  WORKSPACE_CONTEXT_KEY
} from '$lib/state/context';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import AppShell from '$lib/components/AppShell.svelte';
import FloatingPanel from '$lib/components/FloatingPanel.svelte';
import { NODE_A, NODE_B, WORKSPACE_ID } from './fixtures/graph';
import { contextWithLocale, localeContext } from './harness/locale';
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
    props: { params: {}, data: { apiBaseUrl: BASE_URL, locale: 'es' } },
    context: contextWithLocale([
      [SESSION_CONTEXT_KEY, session],
      [WORKSPACE_CONTEXT_KEY, workspace],
      [API_CLIENT_CONTEXT_KEY, client]
    ])
  });
}

describe('the workspace of the graph', () => {
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

  it('is the window: the shell does not scroll and the footer has no room', () => {
    const { container } = render(AppShell, {
      props: { title: 'VozLab', workspace: true },
      context: localeContext()
    });

    const shell = container.firstElementChild as HTMLElement;

    // The shell is exactly as tall as the visual viewport, and it never
    // scrolls: the page does not scroll either.
    expect(shell.className).toContain('h-dvh');
    expect(shell.className).toContain('overflow-hidden');

    // The footer is gone: the window belongs to the picture.
    expect(container.querySelector('footer')).toBeNull();
  });

  it('the canvas is the whole area and the panels float over it', async () => {
    renderPage();

    // A root is picked, so the picture of the subgraph is drawn.
    await fireEvent.click(await screen.findByRole('button', { name: NODE_A.title }));

    const workspace = document.querySelector('.relative.h-full.w-full');
    expect(workspace).not.toBeNull();

    // The picture is the area: it is absolutely positioned over the whole
    // workspace, and it is **not** a column of a grid — the inspector does
    // not narrow it.
    const canvas = await screen.findByRole('img', { name: 'Lienzo del subgrafo' });
    const picture = canvas.parentElement as HTMLElement;

    expect(picture.className).toContain('absolute');
    expect(picture.className).toContain('inset-0');
    expect(picture.parentElement?.className).not.toContain('grid-cols');

    // The panels float: they are absolute too. A panel that opens does not
    // change the size of the picture — it is over it, not beside it.
    const toolbar = screen.getByRole('region', { name: 'Las herramientas del grafo' });
    expect(toolbar.className).toContain('absolute');
    expect(toolbar.className).toContain('shadow-float');

    const inspector = screen.getByRole('complementary', { name: 'Inspección' });
    expect(inspector.closest('section')?.className).toContain('absolute');
  });

  it('the list starts below the toolbar and ends before the inspector', async () => {
    renderPage();

    const toggle = await screen.findByRole('button', { name: 'Lista' });
    await fireEvent.click(toggle);

    const list = screen
      .getByRole('heading', { name: 'El subgrafo en forma de lista' })
      .closest('div[style]') as HTMLElement;

    // The list is inset: it does not run under the floating panels, which
    // would make it a list the reader cannot click.
    expect(list.style.paddingTop).not.toBe('');
    expect(list.style.paddingRight).not.toBe('');
  });

  it('a floating panel is a solid surface with a shadow and no glass', () => {
    const { container } = render(FloatingPanel, {
      props: { label: 'Un panel' },
      context: localeContext()
    });

    const panel = container.querySelector('section') as HTMLElement;

    // It is solid: a surface of the design system, with the border that
    // says "I am over the picture" and the shadow of what truly floats.
    expect(panel.className).toContain('bg-surface');
    expect(panel.className).toContain('border-border');
    expect(panel.className).toContain('shadow-float');

    // No glass: no blur, ever.
    expect(panel.className).not.toContain('backdrop');
    expect(getComputedStyle(panel).backdropFilter).toBe('none');
  });

  it('has no glass anywhere in the interface', () => {
    const root = process.cwd();
    const source = join(root, 'src');

    for (const path of sources(source)) {
      const content = readFileSync(path, 'utf8');

      expect(content, path).not.toContain('backdrop-blur');
      expect(content, path).not.toContain('backdrop-filter');
    }
  });

  it('the list is one click away and the toggle announces its state', async () => {
    renderPage();

    const toggle = await screen.findByRole('button', { name: 'Lista' });

    // The state is announced, and the list is not there yet.
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('table')).toBeNull();

    await fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // The list is a real DOM list, in the same area as the picture.
    await waitFor(() => {
      expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
    });

    expect(screen.getByRole('heading', { name: 'El subgrafo en forma de lista' })).toBeInTheDocument();

    // And the toggle is the way back.
    await fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('the controls of the toolbar keep their hit area on a touch device', () => {
    // Forty-four pixels: the minimum the platforms ask for. The rule is
    // in the stylesheet and it applies to every control of the interface
    // on a coarse pointer — a mouse does not need a button of forty-four
    // pixels, and the density of a wide screen is part of what makes it
    // readable.
    const stylesheet = readFileSync(join(process.cwd(), 'src', 'app.css'), 'utf8');

    expect(stylesheet).toContain('@media (pointer: coarse)');
    expect(stylesheet).toContain('min-height: 2.75rem');
  });

  it('the mode switch keeps its hit area on a touch device', async () => {
    renderPage();

    const label = await screen.findByText('Explorar', { exact: true });

    expect(label.className).toContain('pointer-coarse:min-h-11');
  });
});

/** The files of the source tree. */
function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);

    if (statSync(path).isDirectory()) {
      yield* sources(path);
      continue;
    }

    if (/\.(svelte|ts|css|html)$/.test(entry)) {
      yield path;
    }
  }
}
