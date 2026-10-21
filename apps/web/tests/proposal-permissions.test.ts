import { fireEvent, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProposalDto } from '$lib/api/types';
import { autoApplyCriteriaMet, proposalPermissions } from '$lib/governance/permissions';
import { json, renderGovernance } from './harness/governance';
import { MAINTAINER_HASH, OLD_SUPPORTED_PROPOSAL, PROPOSAL, PROPOSER_HASH } from './fixtures/governance';
import { NODE_A } from './fixtures/graph';
import Proposals from '../src/routes/(app)/proposals/+page.svelte';

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

const { pageState } = vi.hoisted(() => ({
  pageState: { url: new URL('http://localhost:5173/proposals') }
}));
vi.mock('$app/state', () => ({ page: pageState }));

const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto }));

/**
 * The stub of the reads of the proposal screen.
 *
 * The target of the proposal is `NODE_A`, whose author is the maintainer —
 * the API compares the resolver with the author of the **target**, not with
 * the author of the proposal.
 */
function stubFetch(
  proposal: ProposalDto,
  answers: { autoApply?: () => Response } = {}
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.includes('/proposals') && method === 'GET') {
      return json({ proposals: [proposal], nextCursor: null });
    }
    if (url.includes('/auto-apply')) {
      return answers.autoApply
        ? answers.autoApply()
        : json({ id: proposal.id, status: 'AUTO_APPLIED' });
    }
    if (url.includes('/discussions')) {
      return json({ threads: [], nextCursor: null });
    }
    if (url.includes('/nodes/')) {
      return json({ node: NODE_A });
    }

    throw new Error(`unexpected request: ${method} ${url}`);
  });
}

/** Opens the proposal of the list and waits for its review. */
async function openProposal(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /propuesta de edición de nodo/i })).toBeInTheDocument();
  });

  await fireEvent.click(screen.getByRole('button', { name: /propuesta de edición de nodo/i }));

  await waitFor(() => {
    expect(screen.getByRole('heading', { name: /^(Propuesta de edición|Propuesta de fusión)$/i })).toBeInTheDocument();
  });
}

describe('the resolution controls of a proposal', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('computes the auto-apply criteria from the DTO', () => {
    const now = Date.parse('2026-10-20T12:00:00.000Z');

    expect(autoApplyCriteriaMet(OLD_SUPPORTED_PROPOSAL, now).met).toBe(true);
    // Too young.
    expect(autoApplyCriteriaMet(PROPOSAL, now).met).toBe(false);
    // The score is too low.
    expect(autoApplyCriteriaMet({ ...OLD_SUPPORTED_PROPOSAL, communityScore: 9 }, now).met).toBe(
      false
    );
    // The age is too short.
    expect(autoApplyCriteriaMet({ ...OLD_SUPPORTED_PROPOSAL, createdAt: '2026-10-19T12:00:00.000Z' }, now).met).toBe(
      false
    );
  });

  it('hides the approve and reject controls from everybody but the maintainer', () => {
    const now = Date.parse('2026-10-20T12:00:00.000Z');

    const maintainer = proposalPermissions({
      proposal: PROPOSAL,
      authorHash: MAINTAINER_HASH,
      isModerator: false,
      targetMaintainerHash: MAINTAINER_HASH,
      now
    });
    expect(maintainer.canResolve).toBe(true);

    // The author of the proposal is not the maintainer of its target.
    const proposer = proposalPermissions({
      proposal: PROPOSAL,
      authorHash: PROPOSER_HASH,
      isModerator: false,
      targetMaintainerHash: MAINTAINER_HASH,
      now
    });
    expect(proposer.canResolve).toBe(false);
  });

  it('shows the approve and reject controls to the maintainer of the target', async () => {
    const fetchMock = stubFetch(PROPOSAL);
    renderGovernance(Proposals, { authorHash: MAINTAINER_HASH, fetch: fetchMock });

    await openProposal();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Aprobar' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument();
  });

  it('hides the approve and reject controls from a user who is not the maintainer', async () => {
    const fetchMock = stubFetch(PROPOSAL);
    renderGovernance(Proposals, { authorHash: PROPOSER_HASH, fetch: fetchMock });

    await openProposal();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^(Propuesta de edición|Propuesta de fusión)$/i })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
  });

  it('shows the auto-apply control to a moderator when the criteria are met', async () => {
    const fetchMock = stubFetch(OLD_SUPPORTED_PROPOSAL);
    renderGovernance(Proposals, { authorHash: MAINTAINER_HASH, role: 'MODERATOR', fetch: fetchMock });

    await openProposal();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Aplicar automáticamente' })).toBeInTheDocument();
    });
  });

  it('hides the auto-apply control from a member', async () => {
    const fetchMock = stubFetch(OLD_SUPPORTED_PROPOSAL);
    renderGovernance(Proposals, { authorHash: MAINTAINER_HASH, role: 'MEMBER', fetch: fetchMock });

    await openProposal();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Aprobar' })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Aplicar automáticamente' })).not.toBeInTheDocument();
  });

  it('hides the auto-apply control when the criteria are not met', async () => {
    const fetchMock = stubFetch(PROPOSAL);
    renderGovernance(Proposals, { authorHash: MAINTAINER_HASH, role: 'MODERATOR', fetch: fetchMock });

    await openProposal();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Aprobar' })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Aplicar automáticamente' })).not.toBeInTheDocument();
    expect(screen.getByText(/la puntuación de la comunidad está por debajo de 10/i)).toBeInTheDocument();
  });

  it('surfaces the refusal of the API when the criteria are not met', async () => {
    const fetchMock = stubFetch(OLD_SUPPORTED_PROPOSAL, {
      autoApply: () =>
        json(
          {
            code: 'ERR_UNMET_AUTO_APPLY_CRITERIA',
            message: 'Proposal does not meet the auto-apply criteria'
          },
          422
        )
    });
    renderGovernance(Proposals, { authorHash: MAINTAINER_HASH, role: 'MODERATOR', fetch: fetchMock });

    await openProposal();

    const button = await screen.findByRole('button', { name: 'Aplicar automáticamente' });
    await fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('ERR_UNMET_AUTO_APPLY_CRITERIA');
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Proposal does not meet the auto-apply criteria'
    );
  });

  it('approves a proposal and shows the new status', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/proposals') && method === 'GET') {
        return json({ proposals: [PROPOSAL], nextCursor: null });
      }
      if (url.includes('/approve')) {
        return json({ id: PROPOSAL.id, status: 'APPROVED_BY_AUTHOR' });
      }
      if (url.includes('/discussions')) {
        return json({ threads: [], nextCursor: null });
      }
      if (url.includes('/nodes/')) {
        return json({ node: NODE_A });
      }

      throw new Error(`unexpected request: ${method} ${url}`);
    });

    renderGovernance(Proposals, { authorHash: MAINTAINER_HASH, fetch: fetchMock });

    await openProposal();

    await fireEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));

    await waitFor(() => {
      expect(
        screen.getByText('La propuesta está ahora en Aprobada por la autoría.')
      ).toBeInTheDocument();
    });
  });
});
