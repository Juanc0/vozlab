/**
 * The inspector: the one column of tabs beside the canvas.
 *
 * The tests exercise the behaviour the column promises: the four tabs, the
 * node and the relation, the asymmetry of the actions (a relation can be
 * edited directly by its author, a node never can), the real data of the
 * proposals and of the forum, and the toggle that gives the canvas the
 * room.
 */

import { fireEvent, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Inspector from '$lib/components/Inspector.svelte';
import { VoteLedger } from '$lib/governance/vote.svelte';
import { json, renderGovernance, requestedUrls, BASE_URL } from './harness/governance';
import { EDGE, NODE_A, NODE_B, OTHER_PROPOSAL, PROPOSAL } from './fixtures/graph';
import { EDGE_DTO, POST, REPLY, THREAD } from './fixtures/inspector';

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

/** The props of a rendered inspector. */
function props(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    selection: { kind: 'node', id: NODE_A.id },
    nodes: [NODE_A, NODE_B],
    ledger: new VoteLedger(),
    open: true,
    ...overrides
  };
}

/** Renders the inspector with the state of a signed-in user. */
function renderInspector(
  options: { authorHash?: string | null } = {},
  overrides: Record<string, unknown> = {},
  fetchMock?: ReturnType<typeof vi.fn>
): { fetchMock: ReturnType<typeof vi.fn>; ontoggle: ReturnType<typeof vi.fn> } {
  const ontoggle = vi.fn();
  const harness = renderGovernance(
    Inspector,
    { authorHash: options.authorHash ?? null, fetch: fetchMock },
    props({ ontoggle, ...overrides })
  );

  return { fetchMock: harness.fetchMock, ontoggle };
}

describe('the inspector', () => {
  beforeEach(() => {
    sessionStorage.clear();
    goto.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the four tabs and the selected thing', async () => {
    renderInspector();

    expect(screen.getByRole('tab', { name: 'Contenido' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Atributos' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Propuestas' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Foro' })).toBeInTheDocument();

    // The selected tab is the only one in the tab order.
    expect(screen.getByRole('tab', { name: 'Contenido' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Foro' })).toHaveAttribute('tabindex', '-1');

    // The panel shows the selected node.
    expect(screen.getByRole('heading', { name: NODE_A.title })).toBeInTheDocument();
    expect(screen.getByText(NODE_A.description ?? '')).toBeInTheDocument();
    expect(screen.getByText(NODE_A.authorHash)).toBeInTheDocument();
  });

  it('asks for a selection when nothing is selected', () => {
    renderInspector({}, { selection: null });

    expect(screen.getByText(/selecciona un nodo o una relación/i)).toBeInTheDocument();
  });

  it('moves between the tabs with the arrow keys', async () => {
    renderInspector();

    const content = screen.getByRole('tab', { name: 'Contenido' });
    content.focus();

    await fireEvent.keyDown(content, { key: 'ArrowRight' });

    expect(screen.getByRole('tab', { name: 'Atributos' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Contenido' })).toHaveAttribute('tabindex', '-1');
  });

  it('reads the selected relation with the API and shows its key, its ends and its score', async () => {
    const fetchMock = vi.fn(async () => json({ edge: EDGE_DTO }));

    renderInspector({}, { selection: { kind: 'edge', id: EDGE.id } }, fetchMock);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: EDGE_DTO.relationKey })).toBeInTheDocument();
    });

    // The relation is not in the subgraph response: the inspector reads it.
    expect(requestedUrls(fetchMock)).toContain(`${BASE_URL}/edges/${EDGE.id}`);

    // Its two ends and its score.
    expect(screen.getByText(NODE_A.title)).toBeInTheDocument();
    expect(screen.getByText(NODE_B.title)).toBeInTheDocument();
    expect(screen.getByText(String(EDGE_DTO.communityScore), { selector: 'dd' })).toBeInTheDocument();
  });

  it('offers the direct edition of a relation to its author', async () => {
    const fetchMock = vi.fn(async () => json({ edge: EDGE_DTO }));

    renderInspector(
      { authorHash: EDGE_DTO.authorHash },
      { selection: { kind: 'edge', id: EDGE.id } },
      fetchMock
    );

    await fireEvent.click(screen.getByRole('tab', { name: 'Atributos' }));

    const edit = await screen.findByRole('button', { name: 'Editar directamente' });
    expect(edit).toBeEnabled();
  });

  it('does not offer the direct edition of a relation to somebody else, and says why', async () => {
    const fetchMock = vi.fn(async () => json({ edge: EDGE_DTO }));

    renderInspector(
      { authorHash: 'f'.repeat(64) },
      { selection: { kind: 'edge', id: EDGE.id } },
      fetchMock
    );

    await fireEvent.click(screen.getByRole('tab', { name: 'Atributos' }));

    const edit = await screen.findByRole('button', { name: 'Editar directamente' });
    expect(edit).toBeDisabled();
    expect(screen.getByText(/Solo quien ha creado la relación puede editarla/)).toBeInTheDocument();
  });

  it('offers the correction of a node and no direct edition of it', async () => {
    renderInspector({ authorHash: NODE_A.authorHash });

    await fireEvent.click(screen.getByRole('tab', { name: 'Atributos' }));

    expect(
      screen.getByRole('button', { name: `Sugerir una corrección del nodo ${NODE_A.title}` })
    ).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Editar directamente' })).not.toBeInTheDocument();
    expect(screen.getByText(/Un nodo no se edita directamente/)).toBeInTheDocument();
  });

  it('filters the proposals of the target and says that the history is partial', async () => {
    const fetchMock = vi.fn(async () => json({ proposals: [PROPOSAL, OTHER_PROPOSAL], nextCursor: 'cursor-2' }));

    renderInspector({}, {}, fetchMock);

    await fireEvent.click(screen.getByRole('tab', { name: 'Propuestas' }));

    // The API has no `targetId` filter: the page is narrowed by `targetType`
    // and the target is filtered here.
    await waitFor(() => {
      expect(requestedUrls(fetchMock)).toContain(`${BASE_URL}/proposals?targetType=NODE&limit=100`);
    });

    await waitFor(() => {
      expect(screen.getByText(PROPOSAL.justification ?? '')).toBeInTheDocument();
    });

    // The proposal of the other node is not in the list.
    expect(screen.queryByText(OTHER_PROPOSAL.justification ?? '')).not.toBeInTheDocument();

    // The page was truncated: the history is partial, and the tab says so.
    expect(screen.getByText(/parcial/i)).toBeInTheDocument();
  });

  it('lists the threads, the posts and the nested replies of the forum', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/discussions/') && url.includes('/posts')) {
        return json({ posts: [POST, REPLY], nextCursor: null });
      }

      if (url.includes('/discussions')) {
        return json({ threads: [THREAD], nextCursor: null });
      }

      return json({});
    });

    renderInspector({}, {}, fetchMock);

    await fireEvent.click(screen.getByRole('tab', { name: 'Foro' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: THREAD.title })).toBeInTheDocument();
    });

    // The thread is opened: its posts are read.
    await fireEvent.click(screen.getByRole('button', { name: THREAD.title }));

    await waitFor(() => {
      expect(screen.getByText(POST.body)).toBeInTheDocument();
    });
    expect(screen.getByText(REPLY.body)).toBeInTheDocument();

    // The box to answer.
    expect(screen.getByLabelText('Escribe un comentario')).toBeInTheDocument();
  });

  it('hides and shows the inspector with the toggle, and announces its state', async () => {
    const { ontoggle } = renderInspector();

    const toggle = screen.getByRole('button', { name: 'Ocultar el inspector' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await fireEvent.click(toggle);

    expect(ontoggle).toHaveBeenCalledWith(false);
  });

  it('surfaces the refusal of a direct edition and keeps what the user typed', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return json(
          { code: 'ERR_AUTHORIZATION_FAILED', message: 'Only the author may edit this relation' },
          403
        );
      }

      return json({ edge: EDGE_DTO });
    });

    renderInspector({ authorHash: EDGE_DTO.authorHash }, { selection: { kind: 'edge', id: EDGE.id } }, fetchMock);

    await fireEvent.click(screen.getByRole('tab', { name: 'Atributos' }));

    await fireEvent.click(await screen.findByRole('button', { name: 'Editar directamente' }));

    const key = await screen.findByLabelText('Clave de la relación');
    await fireEvent.input(key, { target: { value: 'INFORMS' } });

    await fireEvent.click(screen.getByRole('button', { name: 'Guardar los cambios' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('ERR_AUTHORIZATION_FAILED');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Only the author may edit this relation');

    // The form keeps what the user typed.
    expect((key as HTMLInputElement).value).toBe('INFORMS');
  });

  it('saves the direct edition of a relation and adopts the new state', async () => {
    const updated = { ...EDGE_DTO, relationKey: 'INFORMS' };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return json({ edge: updated });
      }

      return json({ edge: EDGE_DTO });
    });

    renderInspector({ authorHash: EDGE_DTO.authorHash }, { selection: { kind: 'edge', id: EDGE.id } }, fetchMock);

    await fireEvent.click(screen.getByRole('tab', { name: 'Atributos' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Editar directamente' }));

    const key = await screen.findByLabelText('Clave de la relación');
    await fireEvent.input(key, { target: { value: 'INFORMS' } });

    await fireEvent.click(screen.getByRole('button', { name: 'Guardar los cambios' }));

    await waitFor(() => {
      expect(screen.getByText('La relación se ha actualizado.')).toBeInTheDocument();
    });

    const patch = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'PATCH');
    expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toEqual({ relationKey: 'INFORMS' });
  });

  it('keeps the panels of the tab it shows and labels them', async () => {
    renderInspector();

    const panel = screen.getByRole('tabpanel');
    const content = screen.getByRole('tab', { name: 'Contenido' });

    expect(panel).toHaveAttribute('aria-labelledby', content.getAttribute('id'));
  });
});
