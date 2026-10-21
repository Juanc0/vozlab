/**
 * The proposal reads the canvas needs — and the governance flow of 3.5.
 *
 * The API has **no `targetId` filter** on `GET /api/v1/proposals`: the query
 * accepts `status`, `targetType`, `kind`, `limit` and `cursor` only. The
 * history of one target — a node or a relation — is therefore filtered
 * **client-side** over one bounded page — and when that page was truncated
 * (`nextCursor` present) the history is *partial*. The UI says so;
 * pretending otherwise would be a lie.
 *
 * The list of the workspace, on the other hand, is a first-class read: it is
 * filtered by the API itself and paged with the opaque keyset cursor.
 */

import { cursorQuery, type ApiClient, type CursorPage, type QueryValue } from './client';
import type {
  ProposalDto,
  ProposalKind,
  ProposalStatus,
  TargetType
} from './types';

/** The largest page of proposals the API accepts (`ListProposalQuerySchema`). */
export const PROPOSAL_MAX_LIMIT = 100;

/** The default page of proposals of the node history (one bounded page). */
export const PROPOSAL_DEFAULT_LIMIT = 100;

/** The page size of the proposal list of the governance screen. */
export const PROPOSAL_LIST_PAGE_SIZE = 20;

/** Clamps the page size of the proposal list to the window the API accepts. */
export function clampProposalLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return PROPOSAL_DEFAULT_LIMIT;
  }
  return Math.min(PROPOSAL_MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

/** The proposals of one target, and whether the page they came from was cut. */
export interface TargetProposalHistory {
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
 * Reads the proposal history of one target — a node or a relation.
 *
 * The page is bounded (`targetType` plus a `limit`); the target filter is
 * applied here, and the truncation of the page is reported so the UI can
 * say that the history is partial.
 */
export async function loadTargetProposalHistory(
  client: ApiClient,
  target: { readonly targetId: string; readonly targetType: TargetType },
  limit: number = PROPOSAL_DEFAULT_LIMIT
): Promise<TargetProposalHistory> {
  const page = await client.page<ProposalDto>({
    path: '/proposals',
    resourceKey: 'proposals',
    query: {
      targetType: target.targetType,
      limit: clampProposalLimit(limit)
    }
  });

  return {
    proposals: filterProposalsByTarget(page.items, target.targetId),
    truncated: page.nextCursor !== null
  };
}

/**
 * Reads the proposal history of one node.
 *
 * A thin wrapper over {@link loadTargetProposalHistory}: the node is the
 * target the canvas' panel used to ask for.
 */
export async function loadNodeProposalHistory(
  client: ApiClient,
  targetId: string,
  limit: number = PROPOSAL_DEFAULT_LIMIT
): Promise<TargetProposalHistory> {
  return loadTargetProposalHistory(client, { targetId, targetType: 'NODE' }, limit);
}

/** The filters of the proposal list — every one of them is optional. */
export interface ProposalFilters {
  /** The state of the proposals (`PENDING`, `APPROVED_BY_AUTHOR`, …). */
  readonly status?: ProposalStatus | null;
  /** The kind of the target (`NODE`, `EDGE`, `ONTOLOGY`). */
  readonly targetType?: TargetType | null;
  /** The kind of the proposal (`EDIT`, `MERGE`). */
  readonly kind?: ProposalKind | null;
}

/**
 * Builds the query of `GET /api/v1/proposals`.
 *
 * An empty filter is **dropped**, not sent as an empty string: the API
 * validates the query with `ListProposalQuerySchema`, and an empty
 * `status` is not a valid status. The cursor is only sent when there is one
 * — the first page has none.
 */
export function buildProposalQuery(
  filters: ProposalFilters = {},
  limit: number = PROPOSAL_LIST_PAGE_SIZE,
  cursor: string | null = null
): Record<string, QueryValue> {
  const query: Record<string, QueryValue> = {};

  if (filters.status) {
    query.status = filters.status;
  }
  if (filters.targetType) {
    query.targetType = filters.targetType;
  }
  if (filters.kind) {
    query.kind = filters.kind;
  }

  return { ...query, ...cursorQuery(clampProposalLimit(limit), cursor) };
}

/**
 * Reads one page of the workspace's proposals.
 *
 * The list is ordered `createdAt DESC, id DESC` and paged with the opaque
 * keyset cursor: the next page is read with the `nextCursor` of this one.
 */
export async function listProposals(
  client: ApiClient,
  options: {
    readonly filters?: ProposalFilters;
    readonly limit?: number;
    readonly cursor?: string | null;
  } = {}
): Promise<CursorPage<ProposalDto>> {
  return client.page<ProposalDto>({
    path: '/proposals',
    resourceKey: 'proposals',
    query: buildProposalQuery(
      options.filters ?? {},
      options.limit ?? PROPOSAL_LIST_PAGE_SIZE,
      options.cursor ?? null
    )
  });
}

/** Reads one proposal by its id — the full {@link ProposalDto}. */
export async function getProposal(client: ApiClient, proposalId: string): Promise<ProposalDto> {
  const body = await client.request<{ proposal: ProposalDto }>({
    path: `/proposals/${encodeURIComponent(proposalId)}`
  });

  return body.proposal;
}

/** The outcome of a resolution: the id and the new status of the proposal. */
export interface ResolvedProposal {
  readonly id: string;
  readonly status: ProposalStatus;
}

/**
 * The body of a proposal creation.
 *
 * The kind is not part of it: the PWA opens **edit** proposals only — a
 * merge is another flow (ADR-0026) and it is not offered here.
 */
export interface CreateProposalInput {
  /** The id of the target of the proposal. */
  readonly targetId: string;
  /** The kind of the target (`NODE` or `EDGE`). */
  readonly targetType: TargetType;
  /** The delta the proposal would apply to the target. */
  readonly proposedChanges: Record<string, unknown>;
  /** Why the correction is proposed. */
  readonly justification?: string;
}

/**
 * The answer of `POST /api/v1/proposals`.
 *
 * The route answers with a **projection** of the proposal: the id, the
 * target, the kind, the status and the score. It is not the whole
 * {@link ProposalDto} — the delta and the author pseudonym are not in it.
 */
export interface CreatedProposal {
  readonly id: string;
  readonly targetId: string;
  readonly targetType: TargetType;
  readonly kind: ProposalKind;
  readonly status: ProposalStatus;
  readonly communityScore: number;
}

/**
 * Opens a proposal on a target (FR-10).
 *
 * Any member of the workspace may open one: the API checks that the target
 * exists in the workspace and creates the proposal **pending** — only the
 * maintainer of the target (or a moderator, through the auto-apply) may
 * resolve it. The API re-checks everything; the form's job is to send a
 * well-formed delta.
 */
export async function createProposal(
  client: ApiClient,
  input: CreateProposalInput
): Promise<CreatedProposal> {
  const body = await client.request<CreatedProposal>({
    method: 'POST',
    path: '/proposals',
    body: {
      kind: 'EDIT',
      targetId: input.targetId,
      targetType: input.targetType,
      proposedChanges: input.proposedChanges,
      ...(input.justification === undefined || input.justification.trim() === ''
        ? {}
        : { justification: input.justification.trim() })
    }
  });

  return {
    id: body.id,
    targetId: body.targetId,
    targetType: body.targetType,
    kind: body.kind,
    status: body.status,
    communityScore: body.communityScore
  };
}

/**
 * Approves a proposal (FR-12).
 *
 * **Only the target's maintainer may do this** — the API compares the
 * caller's pseudonym with the author of the *target* of the proposal, not
 * with the author of the proposal. The UI shows the control as a hint; the
 * API is the enforcement and answers `403 ERR_AUTHORIZATION_FAILED`.
 */
export async function approveProposal(
  client: ApiClient,
  proposalId: string
): Promise<ResolvedProposal> {
  const body = await client.request<ResolvedProposal>({
    method: 'PUT',
    path: `/proposals/${encodeURIComponent(proposalId)}/approve`
  });

  return { id: body.id, status: body.status };
}

/**
 * Rejects a proposal (FR-12).
 *
 * The same rule as {@link approveProposal}: the target's maintainer only.
 */
export async function rejectProposal(
  client: ApiClient,
  proposalId: string
): Promise<ResolvedProposal> {
  const body = await client.request<ResolvedProposal>({
    method: 'PUT',
    path: `/proposals/${encodeURIComponent(proposalId)}/reject`
  });

  return { id: body.id, status: body.status };
}

/**
 * Auto-applies a proposal (FR-13).
 *
 * The API requires a `MODERATOR`/`ADMIN` role **and** the domain criteria
 * (age ≥ 14 days and `communityScore >= 10`); it answers `422
 * ERR_UNMET_AUTO_APPLY_CRITERIA` when they are not met. The UI shows the
 * control only when both are computable from the DTO — and it still
 * surfaces the `422` when the server disagrees.
 */
export async function autoApplyProposal(
  client: ApiClient,
  proposalId: string
): Promise<ResolvedProposal> {
  const body = await client.request<ResolvedProposal>({
    method: 'PUT',
    path: `/proposals/${encodeURIComponent(proposalId)}/auto-apply`
  });

  return { id: body.id, status: body.status };
}
