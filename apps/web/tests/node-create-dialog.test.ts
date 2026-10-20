import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '$lib/api/client';
import NodeCreateDialog from '$lib/components/NodeCreateDialog.svelte';
import { API_CLIENT_CONTEXT_KEY, WORKSPACE_CONTEXT_KEY } from '$lib/state/context';
import { SessionState } from '$lib/state/session.svelte';
import { WorkspaceState } from '$lib/state/workspace.svelte';
import { ONTOLOGY } from './fixtures/ontology';
import { WORKSPACE_ID } from './fixtures/graph';

const BASE_URL = 'http://localhost:3000/api/v1';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function renderDialog(
  options: { ontology?: typeof ONTOLOGY | null; oncreated?: (created: unknown) => void } = {}
): void {
  const session = new SessionState();
  const workspace = new WorkspaceState();
  workspace.hydrate([{ id: WORKSPACE_ID, slug: 'general', name: 'General', role: 'MEMBER' }]);
  workspace.setWorkspace(WORKSPACE_ID);

  const client = new ApiClient({ baseUrl: BASE_URL, session, workspace });

  render(NodeCreateDialog, {
    props: {
      open: true,
      ontology: options.ontology === undefined ? ONTOLOGY : options.ontology,
      onclose: () => {},
      oncreated: options.oncreated
    },
    context: new Map<unknown, unknown>([
      [API_CLIENT_CONTEXT_KEY, client],
      [WORKSPACE_CONTEXT_KEY, workspace]
    ])
  });
}

/** The body of the `POST /api/v1/nodes` call. */
function postedBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/nodes'));
  expect(call, 'the node was not created').toBeDefined();

  const init = call?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
}

describe('the node creation form', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('builds the fields from the datatype properties of the chosen class', () => {
    renderDialog();

    // The class picker lists the active classes by their display name.
    const classPicker = screen.getByLabelText('Ontology class') as HTMLSelectElement;
    expect(
      Array.from(classPicker.options).map((option) => option.textContent?.trim())
    ).toEqual(['Idea', 'Problem', 'Resource']);

    // The class of the form is the first one: `Idea`.
    expect(screen.getByLabelText(/^State/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Resolved/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Due date/)).toBeInTheDocument();
  });

  it('shows the fields of the class the user picks', async () => {
    renderDialog();

    const classPicker = screen.getByLabelText('Ontology class');
    await fireEvent.change(classPicker, { target: { value: 'Problem' } });

    expect(screen.getByLabelText(/Severity/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Source/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/State/)).not.toBeInTheDocument();
  });

  it('skips a property that re-declares a field of the node and says why', async () => {
    renderDialog();

    const classPicker = screen.getByLabelText('Ontology class');
    await fireEvent.change(classPicker, { target: { value: 'Problem' } });

    // The node's own fields are asked once, not twice.
    expect(screen.getAllByLabelText(/Title/)).toHaveLength(1);
    expect(screen.getAllByLabelText(/Description/)).toHaveLength(1);

    expect(screen.getByText('Not shown in this form')).toBeInTheDocument();
    expect(screen.getByText('title')).toBeInTheDocument();
    expect(screen.getAllByText(/re-declares a field of the node itself/)).toHaveLength(2);
  });

  it('drives the input kind and the initial value with the datatype', async () => {
    renderDialog();

    const classPicker = screen.getByLabelText('Ontology class');
    await fireEvent.change(classPicker, { target: { value: 'Problem' } });

    const severity = screen.getByLabelText(/Severity/) as HTMLInputElement;
    expect(severity.type).toBe('number');
    expect(severity.value).toBe('3');
    expect(severity.getAttribute('aria-required')).toBe('true');

    const source = screen.getByLabelText(/Source/) as HTMLInputElement;
    expect(source.type).toBe('text');
    expect(source.value).toBe('runbook');
    expect(source.getAttribute('aria-required')).toBeNull();
  });

  it('creates the node with the attributes keyed by the system key', async () => {
    const fetchMock = vi.fn(async () =>
      json(
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          workspaceId: WORKSPACE_ID,
          typeKey: 'Problem',
          title: 'The campus shuttle leaves every hour',
          description: null,
          status: 'PENDING'
        },
        201
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const oncreated = vi.fn();
    renderDialog({ oncreated });

    const classPicker = screen.getByLabelText('Ontology class');
    await fireEvent.change(classPicker, { target: { value: 'Problem' } });

    await fireEvent.input(screen.getByLabelText(/Title/), {
      target: { value: 'The campus shuttle leaves every hour' }
    });
    await fireEvent.input(screen.getByLabelText(/Severity/), { target: { value: '5' } });
    await fireEvent.input(screen.getByLabelText(/Source/), { target: { value: 'minutes' } });

    await fireEvent.click(screen.getByRole('button', { name: 'Create the node' }));

    await waitFor(() => {
      expect(oncreated).toHaveBeenCalled();
    });

    const body = postedBody(fetchMock);
    expect(body['typeKey']).toBe('Problem');
    expect(body['title']).toBe('The campus shuttle leaves every hour');
    expect(body['attributes']).toEqual({ severity: 5, source: 'minutes' });
  });

  it('refuses an invalid value before the request leaves the app', async () => {
    const fetchMock = vi.fn(async () => json({}));
    vi.stubGlobal('fetch', fetchMock);

    renderDialog();

    const classPicker = screen.getByLabelText('Ontology class');
    await fireEvent.change(classPicker, { target: { value: 'Problem' } });

    await fireEvent.input(screen.getByLabelText(/Title/), { target: { value: 'A valid title' } });
    // A number field refuses a text: the browser empties it, and the form
    // never sends an empty required attribute.
    await fireEvent.input(screen.getByLabelText(/Severity/), { target: { value: 'high' } });

    await fireEvent.click(screen.getByRole('button', { name: 'Create the node' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Severity');
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the envelope of a failed creation and keeps what the user typed', async () => {
    const fetchMock = vi.fn(async () =>
      json(
        {
          code: 'ERR_VALIDATION_FAILED',
          message: 'unknown or inactive typeKey',
          issues: [{ path: ['typeKey'], message: 'unknown or inactive typeKey' }]
        },
        422
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    renderDialog();

    await fireEvent.input(screen.getByLabelText(/Title/), { target: { value: 'A valid title' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Create the node' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('ERR_VALIDATION_FAILED');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('unknown or inactive typeKey');

    // The form kept what the user typed.
    expect((screen.getByLabelText(/Title/) as HTMLInputElement).value).toBe('A valid title');
  });

  it('moves the focus into the form and announces the invalid fields', async () => {
    renderDialog();

    const title = screen.getByLabelText(/Title/) as HTMLInputElement;
    await waitFor(() => {
      expect(document.activeElement).toBe(title);
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Create the node' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('The form has');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Title');
  });
});
