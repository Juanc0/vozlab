/**
 * The correction form — what it sends and what it shows (FR-10).
 *
 * A proposal is a diff: the form shows the current value and the proposed
 * one, sends only the fields that change, and keeps what the user typed
 * when the API refuses the proposal.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '$lib/api/client';
import CorrectionDialog from '$lib/components/CorrectionDialog.svelte';
import type { CorrectionTarget } from '$lib/governance/correction';
import { connectivityState } from '$lib/pwa/connectivity.svelte';
import { API_CLIENT_CONTEXT_KEY, WORKSPACE_CONTEXT_KEY } from '$lib/state/context';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import { EDGE, NODE_A, WORKSPACE_ID } from './fixtures/graph';
import { contextWithLocale } from './harness/locale';

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

const BASE_URL = 'http://localhost:3000/api/v1';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function renderDialog(
  options: {
    target?: CorrectionTarget | null;
    oncreated?: (created: unknown) => void;
    onclose?: () => void;
  } = {}
): void {
  const session = new SessionState();
  const workspace = new WorkspaceState();
  workspace.hydrate([{ id: WORKSPACE_ID, slug: 'general', name: 'General', role: 'MEMBER' }]);
  workspace.setWorkspace(WORKSPACE_ID);

  const client = new ApiClient({ baseUrl: BASE_URL, session, workspace });

  render(CorrectionDialog, {
    props: {
      open: true,
      target: options.target === undefined ? { kind: 'node', node: NODE_A } : options.target,
      onclose: options.onclose ?? (() => {}),
      oncreated: options.oncreated
    },
    context: contextWithLocale([
      [API_CLIENT_CONTEXT_KEY, client],
      [WORKSPACE_CONTEXT_KEY, workspace]
    ])
  });
}

/** The body of the `POST /api/v1/proposals` call. */
function postedBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/proposals'));
  expect(call, 'the proposal was not created').toBeDefined();

  const init = call?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
}

/** The answer of a creation. */
const CREATED = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  targetId: NODE_A.id,
  targetType: 'NODE',
  kind: 'EDIT',
  status: 'PENDING',
  communityScore: 0
};

describe('the correction form', () => {
  beforeEach(() => {
    sessionStorage.clear();
    connectivityState.attach();
    window.dispatchEvent(new Event('online'));
  });

  afterEach(() => {
    window.dispatchEvent(new Event('online'));
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('prefills the form with the state of the target', async () => {
    renderDialog();

    expect((screen.getByLabelText('Título (obligatorio)') as HTMLInputElement).value).toBe(NODE_A.title);
    expect(
      (screen.getByLabelText('Descripción (opcional)') as HTMLTextAreaElement).value
    ).toBe(NODE_A.description);

    // The attributes of the target are the rows of the editor.
    await waitFor(() => {
      expect(screen.getByLabelText('Clave del atributo 1')).toBeInTheDocument();
    });
    expect((screen.getByLabelText('Clave del atributo 1') as HTMLInputElement).value).toBe(
      'severity'
    );
    expect((screen.getByLabelText('Valor del atributo 1') as HTMLInputElement).value).toBe('3');
  });

  it('shows the current value and the proposed one of every field', async () => {
    renderDialog();

    const table = screen.getByRole('table');
    expect(table).toHaveTextContent('The campus shuttle leaves every hour');

    await fireEvent.input(screen.getByLabelText('Título (obligatorio)'), {
      target: { value: 'The campus shuttle leaves every half hour' }
    });

    // The row of the title is marked as a change; the other ones are not.
    const rows = screen.getAllByRole('row');
    const titleRow = rows.find((row) => row.textContent?.trim().startsWith('Título'));
    expect(titleRow).toHaveTextContent('Cambia');
    expect(titleRow).toHaveTextContent('The campus shuttle leaves every half hour');

    const descriptionRow = rows.find((row) =>
      row.textContent?.trim().startsWith('Descripción')
    );
    expect(descriptionRow).toHaveTextContent('Sin cambios');
  });

  it('sends only the fields that change', async () => {
    const fetchMock = vi.fn(async () => json(CREATED, 201));
    vi.stubGlobal('fetch', fetchMock);

    const oncreated = vi.fn();
    renderDialog({ oncreated });

    await fireEvent.input(screen.getByLabelText('Título (obligatorio)'), {
      target: { value: 'The campus shuttle leaves every half hour' }
    });
    await fireEvent.input(screen.getByLabelText('Valor del atributo 1'), {
      target: { value: '5' }
    });
    await fireEvent.input(screen.getByLabelText('Justificación (opcional)'), {
      target: { value: 'The title names the wrong building.' }
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Proponer la corrección' }));

    await waitFor(() => {
      expect(oncreated).toHaveBeenCalled();
    });

    const body = postedBody(fetchMock);
    expect(body['kind']).toBe('EDIT');
    expect(body['targetId']).toBe(NODE_A.id);
    expect(body['targetType']).toBe('NODE');
    expect(body['justification']).toBe('The title names the wrong building.');

    const changes = body['proposedChanges'] as Record<string, unknown>;
    // Only the title and the attribute that changed.
    expect(Object.keys(changes).sort()).toEqual(['attributes', 'title']);
    expect(changes['title']).toBe('The campus shuttle leaves every half hour');
    expect(changes['attributes']).toEqual({ severity: 5 });
  });

  it('coerces the attribute rows to the type they declare', async () => {
    const fetchMock = vi.fn(async () => json(CREATED, 201));
    vi.stubGlobal('fetch', fetchMock);

    renderDialog();

    // A new row: the user says which kind of value it carries.
    await fireEvent.click(screen.getByRole('button', { name: 'Añadir un atributo' }));
    await fireEvent.input(screen.getByLabelText('Clave del atributo 3'), {
      target: { value: 'owner' }
    });
    await fireEvent.change(screen.getByLabelText('Tipo del atributo 3'), {
      target: { value: 'checkbox' }
    });
    await fireEvent.input(screen.getByLabelText('Valor del atributo 1'), {
      target: { value: '7' }
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Proponer la corrección' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const body = postedBody(fetchMock);
    const changes = body['proposedChanges'] as Record<string, unknown>;
    expect(changes['attributes']).toEqual({ severity: 7, owner: false });
  });

  it('refuses to send a proposal that changes nothing', async () => {
    const fetchMock = vi.fn(async () => json({}));
    vi.stubGlobal('fetch', fetchMock);

    renderDialog();

    await fireEvent.click(screen.getByRole('button', { name: 'Proponer la corrección' }));

    await waitFor(() => {
      expect(screen.getByText(/Esta propuesta no cambia nada/)).toBeInTheDocument();
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the envelope of a refused proposal and keeps what the user typed', async () => {
    const fetchMock = vi.fn(async () =>
      json(
        {
          code: 'ERR_DUPLICATE_PROPOSAL',
          message: 'A pending proposal already exists for this target'
        },
        409
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    renderDialog();

    await fireEvent.input(screen.getByLabelText('Título (obligatorio)'), {
      target: { value: 'The campus shuttle leaves every half hour' }
    });
    await fireEvent.input(screen.getByLabelText('Justificación (opcional)'), {
      target: { value: 'The title names the wrong building.' }
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Proponer la corrección' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('ERR_DUPLICATE_PROPOSAL');
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A pending proposal already exists for this target'
    );

    // The form kept what the user typed.
    expect((screen.getByLabelText('Título (obligatorio)') as HTMLInputElement).value).toBe(
      'The campus shuttle leaves every half hour'
    );
    expect(
      (screen.getByLabelText('Justificación (opcional)') as HTMLTextAreaElement).value
    ).toBe('The title names the wrong building.');
  });

  it('reads the relation and prefills its relation key', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith(`/edges/${EDGE.id}`)) {
        return json({
          edge: {
            id: EDGE.id,
            workspaceId: WORKSPACE_ID,
            sourceNodeId: EDGE.sourceNodeId,
            targetNodeId: EDGE.targetNodeId,
            relationKey: EDGE.relationKey,
            attributes: { weight: 2 },
            authorHash: 'a'.repeat(64),
            status: EDGE.status,
            communityScore: EDGE.communityScore,
            createdAt: '2026-10-19T10:00:00.000Z'
          }
        });
      }

      return json(CREATED, 201);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderDialog({ target: { kind: 'edge', edge: EDGE } });

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Clave de la relación (obligatorio)') as HTMLInputElement).value
      ).toBe(EDGE.relationKey);
    });

    // The relation of the subgraph has no attributes: they are read.
    await waitFor(() => {
      expect((screen.getByLabelText('Clave del atributo 1') as HTMLInputElement).value).toBe(
        'weight'
      );
    });
  });

  it('sends the relation key of a relation', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith(`/edges/${EDGE.id}`)) {
        return json({
          edge: {
            id: EDGE.id,
            workspaceId: WORKSPACE_ID,
            sourceNodeId: EDGE.sourceNodeId,
            targetNodeId: EDGE.targetNodeId,
            relationKey: EDGE.relationKey,
            attributes: {},
            authorHash: 'a'.repeat(64),
            status: EDGE.status,
            communityScore: EDGE.communityScore,
            createdAt: '2026-10-19T10:00:00.000Z'
          }
        });
      }

      return json(
        { ...CREATED, targetId: EDGE.id, targetType: 'EDGE' },
        201
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderDialog({ target: { kind: 'edge', edge: EDGE } });

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Clave de la relación (obligatorio)') as HTMLInputElement).value
      ).toBe(EDGE.relationKey);
    });

    await fireEvent.input(screen.getByLabelText('Clave de la relación (obligatorio)'), {
      target: { value: 'INFORMS' }
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Proponer la corrección' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const body = postedBody(fetchMock);
    expect(body['targetType']).toBe('EDGE');
    expect(body['targetId']).toBe(EDGE.id);

    const changes = body['proposedChanges'] as Record<string, unknown>;
    // Only the relation key: the delta of a relation carries no title and no
    // description.
    expect(Object.keys(changes)).toEqual(['relationKey']);
    expect(changes['relationKey']).toBe('INFORMS');
  });

  it('gives the focus to the first field that is not valid', async () => {
    const fetchMock = vi.fn(async () => json({}));
    vi.stubGlobal('fetch', fetchMock);

    renderDialog();

    // The focus is somewhere else when the form is sent: the form must
    // move it to the field that is not valid.
    await fireEvent.input(screen.getByLabelText('Título (obligatorio)'), { target: { value: 'ab' } });
    screen.getByLabelText('Justificación (opcional)').focus();

    await fireEvent.click(screen.getByRole('button', { name: 'Proponer la corrección' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('El formulario tiene');
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText('Título (obligatorio)'));
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gives the focus to the attribute row that is not valid', async () => {
    const fetchMock = vi.fn(async () => json({}));
    vi.stubGlobal('fetch', fetchMock);

    renderDialog();

    // The value of a number row is not a number: the row is the problem.
    await fireEvent.input(screen.getByLabelText('Valor del atributo 1', { exact: true }), {
      target: { value: 'high' }
    });
    screen.getByLabelText('Justificación (opcional)').focus();

    await fireEvent.click(screen.getByRole('button', { name: 'Proponer la corrección' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Este atributo debe ser un número.');
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByLabelText('Valor del atributo 1', { exact: true })
      );
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const onclose = vi.fn();
    renderDialog({ onclose });

    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onclose).toHaveBeenCalled();
  });

  it('refuses the proposal while the browser is offline', async () => {
    const fetchMock = vi.fn(async () => json(CREATED, 201));
    vi.stubGlobal('fetch', fetchMock);

    renderDialog();

    await fireEvent.input(screen.getByLabelText('Título (obligatorio)'), {
      target: { value: 'The campus shuttle leaves every half hour' }
    });

    window.dispatchEvent(new Event('offline'));

    await fireEvent.click(screen.getByRole('button', { name: 'Proponer la corrección' }));

    // The refusal carries the local code and explains itself.
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('ERR_OFFLINE');
    });

    // Nothing left the app: the write is refused before the request.
    expect(fetchMock).not.toHaveBeenCalled();

    // The form kept what the user typed.
    expect((screen.getByLabelText('Título (obligatorio)') as HTMLInputElement).value).toBe(
      'The campus shuttle leaves every half hour'
    );
  });
});
