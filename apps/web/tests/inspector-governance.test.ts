import { fireEvent, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InspectorContent from '$lib/components/InspectorContent.svelte';
import { VoteLedger } from '$lib/governance/vote.svelte';
import { json, renderGovernance } from './harness/governance';
import { NODE_A, NODE_B } from './fixtures/graph';

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

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

const AUTHOR_HASH = 'a'.repeat(64);
const MOD_HASH = 'm'.repeat(64);
const OTHER_HASH = 'z'.repeat(64);

function nodePending(overrides: Partial<typeof NODE_A> = {}) {
  return { ...NODE_A, status: 'PENDING' as const, authorHash: AUTHOR_HASH, ...overrides };
}

describe('inspector governance', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows approve/reject to the author of a pending node', () => {
    renderGovernance(
      InspectorContent,
      { authorHash: AUTHOR_HASH, role: 'MEMBER' },
      { node: nodePending(), nodes: [NODE_A, NODE_B], ledger: new VoteLedger() }
    );

    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument();
  });

  it('hides approve/reject from a non-author non-moderator', () => {
    renderGovernance(
      InspectorContent,
      { authorHash: OTHER_HASH, role: 'MEMBER' },
      { node: nodePending(), nodes: [NODE_A, NODE_B], ledger: new VoteLedger() }
    );

    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
  });

  it('shows approve/reject to a moderator for another user node', () => {
    renderGovernance(
      InspectorContent,
      { authorHash: MOD_HASH, role: 'MODERATOR' },
      { node: nodePending({ authorHash: OTHER_HASH }), nodes: [NODE_A, NODE_B], ledger: new VoteLedger() }
    );

    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument();
  });

  it('shows the auto-apply button to a moderator when score >= 10', () => {
    renderGovernance(
      InspectorContent,
      { authorHash: MOD_HASH, role: 'MODERATOR' },
      { node: nodePending({ authorHash: OTHER_HASH, communityScore: 12 }), nodes: [NODE_A, NODE_B], ledger: new VoteLedger() }
    );

    expect(screen.getByRole('button', { name: /Aplicar automáticamente/i })).toBeInTheDocument();
  });

  it('rolls back the optimistic status on a failed approve', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return json({ code: 'ERR_AUTHORIZATION_FAILED', message: 'no' }, 403);
      }
      return json({ node: nodePending() });
    });

    renderGovernance(
      InspectorContent,
      { authorHash: AUTHOR_HASH, role: 'MEMBER', fetch: fetchMock },
      { node: nodePending(), nodes: [NODE_A, NODE_B], ledger: new VoteLedger() }
    );

    const before = screen.getByText(/Pendiente/i);
    expect(before).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    // status rolled back to PENDING
    expect(screen.getByText(/Pendiente/i)).toBeInTheDocument();
  });
});
