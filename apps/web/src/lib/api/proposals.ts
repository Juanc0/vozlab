/**
 * The proposal reads the canvas needs.
 *
 * The API has **no `targetId` filter** on `GET /api/v1/proposals`: the query
 * accepts `status`, `targetType`, `kind`, `limit` and `cursor` only. The
 * history of one node is therefore filtered **client-side** over one bounded
 * page — and when that page was truncated (`nextCursor` present) the history
 * is *partial*. The UI says so; pretending otherwise would be a lie.
 */

import type { ApiClient } from './client';
import type { ProposalDto } from './types';

/** The largest page of proposals the API accepts (`ListProposalQuerySchema`). */
export const PROPOSAL_MAX_LIMIT = 100;

/** The default page of proposals. */
export const PROPOSAL_DEFAULT_LIMIT = 100;

/** Clamps the page size of the proposal list to the window the API accepts. */
export function clampProposalLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return PROPOSAL_DEFAULT_LIMIT;
  }
  return Math.min(PROPOSAL_MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

/** The proposals of one target, and whether the page they came from was cut. */
export interface NodeProposalHistory {
  /** The proposals of the target, in the order the API returned them. */
  readonly proposals: ProposalDto[];
  /**
   * `true` when the page the API returned was truncated: more proposals of
   * the workspace exist beyond it, so the history is **partial**.
   */
  readonly truncated: boolean;
}

/** Keeps the proposals that target one node. */
export function filterProposalsByTarget(
  proposals: readonly ProposalDto[],
  targetId: string
): ProposalDto[] {
  return proposals.filter((proposal) => proposal.targetId === targetId);
}

/**
 * Reads the proposal history of one node.
 *
 * The page is bounded (`targetType=NODE` plus a `limit`); the target filter
 * is applied here, and the truncation of the page is reported so the UI can
 * say that the history is partial.
 */
export async function loadNodeProposalHistory(
  client: ApiClient,
  targetId: string,
  limit: number = PROPOSAL_DEFAULT_LIMIT
): Promise<NodeProposalHistory> {
  const page = await client.page<ProposalDto>({
    path: '/proposals',
    resourceKey: 'proposals',
    query: {
      targetType: 'NODE',
      limit: clampProposalLimit(limit)
    }
  });

  return {
    proposals: filterProposalsByTarget(page.items, targetId),
    truncated: page.nextCursor !== null
  };
}
