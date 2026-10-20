import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '$lib/api/client';
import EdgeCreateDialog from '$lib/components/EdgeCreateDialog.svelte';
import { API_CLIENT_CONTEXT_KEY, WORKSPACE_CONTEXT_KEY } from '$lib/state/context';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import { NODE_A, NODE_B, WORKSPACE_ID } from './fixtures/graph';
import { ONTOLOGY } from './fixtures/ontology';

const BASE_URL = 'http://localhost:3000/api/v1';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function renderDialog(
  options: { source?: typeof NODE_A | null; nodes?: typeof NODE_A[]; oncreated?: (edge: unknown) => void } = {}
): void {
  const session = new SessionState();
  const workspace = new WorkspaceState();
  workspace.hydrate([{ id: WORKSPACE_ID, slug: 'general', name: 'General', role: 'MEMBER' }]);
  workspace.setWorkspace(WORKSPACE_ID);

  const client = new ApiClient({ baseUrl: BASE_URL, session, workspace });

  render(EdgeCreateDialog, {
    props: {
      open: true,
      ontology: ONTOLOGY,
      source: options.source === undefined ? NODE_A : options.source,
      nodes: options.nodes ?? [NODE_A, NODE_B],
      onclose: () => {},
      oncreated: options.oncreated
    },
    context: new Map<unknown, unknown>([
      [API_CLIENT_CONTEXT_KEY, client],
      [WORKSPACE_CONTEXT_KEY, workspace]
    ])
  });
}

/** The body of the `POST /api/v1/edges` call. */
function postedBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/edges'));
  expect(call, 'the relation was not created').toBeDefined();

  const init = call?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
}

describe('the edge creation form', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('offers only the relations the API would accept for the source', () => {
    renderDialog();

    const picker = screen.getByLabelText('Relation (required)') as HTMLSelectElement;
    expect(Array.from(picker.options).map((option) => option.value)).toEqual(['RELATES_TO']);

    // The domain and the range of the relation are stated.
    expect(screen.getByRole('dialog')).toHaveTextContent('RELATES_TO — from Problem to Idea.');
  });

  it('offers no relation when the ontology declares none for the class', () => {
    renderDialog({ source: { ...NODE_A, typeKey: 'Resource' } });

    expect(screen.queryByLabelText('Relation')).not.toBeInTheDocument();
    expect(screen.getByText(/declares no relation/)).toBeInTheDocument();
  });

  it('offers only the nodes of the range class as the target', () => {
    renderDialog();

    const picker = screen.getByLabelText('To (required)') as HTMLSelectElement;
    const values = Array.from(picker.options).map((option) => option.value);

    // `NODE_A` is a `Problem`: the range of `RELATES_TO` is an `Idea`.
    expect(values).toEqual(['', NODE_B.id]);
  });

  it('creates the relation with the source, the target and the relation key', async () => {
    const fetchMock = vi.fn(async () =>
      json(
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          sourceNodeId: NODE_A.id,
          targetNodeId: NODE_B.id,
          relationKey: 'RELATES_TO',
          status: 'PENDING'
        },
        201
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const oncreated = vi.fn();
    renderDialog({ oncreated });

    await fireEvent.change(screen.getByLabelText('To (required)'), { target: { value: NODE_B.id } });
    await fireEvent.click(screen.getByRole('button', { name: 'Create the relation' }));

    await waitFor(() => {
      expect(oncreated).toHaveBeenCalled();
    });

    const body = postedBody(fetchMock);
    expect(body['sourceNodeId']).toBe(NODE_A.id);
    expect(body['targetNodeId']).toBe(NODE_B.id);
    expect(body['relationKey']).toBe('RELATES_TO');
  });

  it('surfaces the envelope of a refused relation and keeps the form', async () => {
    const fetchMock = vi.fn(async () =>
      json(
        {
          code: 'ERR_INVALID_RELATION_DOMAIN_RANGE',
          message: 'the relation does not accept this pair of classes'
        },
        422
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    renderDialog();

    const target = screen.getByLabelText('To (required)');
    await fireEvent.change(target, { target: { value: NODE_B.id } });
    await fireEvent.click(screen.getByRole('button', { name: 'Create the relation' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('ERR_INVALID_RELATION_DOMAIN_RANGE');
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'the relation does not accept this pair of classes'
    );

    // The form kept what the user picked.
    expect((screen.getByLabelText('To (required)') as HTMLSelectElement).value).toBe(NODE_B.id);
    expect((screen.getByLabelText('Relation (required)') as HTMLSelectElement).value).toBe('RELATES_TO');
  });

  it('refuses to send a relation without a target', async () => {
    const fetchMock = vi.fn(async () => json({}));
    vi.stubGlobal('fetch', fetchMock);

    renderDialog();

    await fireEvent.click(screen.getByRole('button', { name: 'Create the relation' }));

    await waitFor(() => {
      expect(screen.getByText('Pick the node the relation points at.')).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
