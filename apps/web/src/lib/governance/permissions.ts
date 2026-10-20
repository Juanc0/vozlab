/**
 * Who may do what in the governance flow.
 *
 * Every rule here is a **hint to the user**, never the enforcement: the API
 * re-checks every action and answers `403 ERR_AUTHORIZATION_FAILED` (or
 * `422 ERR_UNMET_AUTO_APPLY_CRITERIA`) when the caller is not allowed. The
 * UI shows a control when the DTOs say the call *may* succeed, and it
 * surfaces the refusal when the server disagrees — it never hides a
 * refusal.
 *
 * The rules the API applies:
 *
 * - **Approve / reject** — the maintainer of the *target* of the proposal
 *   (FR-12). The API resolves the target (`resolveTargetAuthorHash`) and
 *   compares its author with the caller's pseudonym. It is **not** the
 *   author of the proposal: anyone may propose an edit, and the proposal
 *   author is usually not the maintainer.
 * - **Auto-apply** — a `MODERATOR`/`ADMIN` of the workspace **and** the
 *   domain criteria (FR-13): age ≥ 14 days and `communityScore >= 10`.
 * - **Close a thread** — the creator of the thread.
 * - **Delete a post** — the author of the post.
 */

import type { PostDto, ProposalDto, ThreadDto } from '$lib/api/types';

/** The minimum age (in days) a proposal must reach before it may be auto-applied. */
export const AUTO_APPLY_MIN_AGE_DAYS = 14;

/** The minimum community score a proposal must reach before it may be auto-applied. */
export const AUTO_APPLY_MIN_SCORE = 10;

/** The milliseconds of a day. */
const DAY_IN_MS = 24 * 60 * 60 * 1000;

/** The age of a proposal, in days. */
export function proposalAgeDays(proposal: ProposalDto, now: number = Date.now()): number {
  const created = Date.parse(proposal.createdAt);
  if (Number.isNaN(created)) {
    return 0;
  }
  return (now - created) / DAY_IN_MS;
}

/** Why the auto-apply control is hidden. */
export type AutoApplyBlocker = 'role' | 'age' | 'score' | 'status';

/**
 * The server-side criteria of the auto-apply (FR-13).
 *
 * They are computable from the DTO: the age comes from `createdAt` and the
 * score from `communityScore`. The API applies the same rule
 * (`EditProposal.autoApply`).
 */
export function autoApplyCriteriaMet(
  proposal: ProposalDto,
  now: number = Date.now()
): { readonly met: boolean; readonly blocker: AutoApplyBlocker | null } {
  if (proposal.status !== 'PENDING') {
    return { met: false, blocker: 'status' };
  }
  if (proposal.communityScore < AUTO_APPLY_MIN_SCORE) {
    return { met: false, blocker: 'score' };
  }
  if (proposalAgeDays(proposal, now) < AUTO_APPLY_MIN_AGE_DAYS) {
    return { met: false, blocker: 'age' };
  }
  return { met: true, blocker: null };
}

/** The decisions the governance screen takes about one proposal. */
export interface ProposalPermissions {
  /** The approve/reject controls are shown. */
  readonly canResolve: boolean;
  /** The auto-apply control is shown. */
  readonly canAutoApply: boolean;
  /** The server-side criteria of the auto-apply are met. */
  readonly criteriaMet: boolean;
  /** Why the auto-apply control is hidden, if it is. */
  readonly autoApplyBlocker: AutoApplyBlocker | null;
}

/** The inputs of {@link proposalPermissions}. */
export interface ProposalPermissionInput {
  /** The proposal the controls belong to. */
  readonly proposal: ProposalDto;
  /**
   * The `authorHash` of the signed-in user — the opaque pseudonym, carried
   * verbatim by the API and the DTOs. `null` when there is no session.
   */
  readonly authorHash: string | null;
  /** `true` when the user is a `MODERATOR` or an `ADMIN` of the workspace. */
  readonly isModerator: boolean;
  /**
   * The `authorHash` of the target's author — the maintainer the API
   * compares the resolver with. `null` when the app could not resolve it.
   */
  readonly targetMaintainerHash?: string | null;
  /** The instant the criteria are evaluated against. */
  readonly now?: number;
}

/**
 * Decides which resolution controls are shown for a proposal.
 *
 * The maintainer of the target is the one the API trusts. When the app
 * could not resolve it (an unreadable target, an ontology class that is
 * still `PROPOSED` and therefore absent from `GET /api/v1/ontology`), the
 * weaker hint of the proposal's own author is used — the API still decides,
 * and its refusal is surfaced.
 */
export function proposalPermissions(
  input: ProposalPermissionInput
): ProposalPermissions {
  const { proposal, authorHash, isModerator } = input;
  const maintainerHash = input.targetMaintainerHash ?? null;

  const isMaintainer =
    authorHash !== null &&
    authorHash !== '' &&
    (maintainerHash !== null
      ? maintainerHash === authorHash
      : proposal.proposerHash === authorHash);

  const criteria = autoApplyCriteriaMet(proposal, input.now);

  const canResolve = isMaintainer && proposal.status === 'PENDING';

  const blocker: AutoApplyBlocker | null =
    proposal.status !== 'PENDING'
      ? 'status'
      : !isModerator
        ? 'role'
        : criteria.blocker;

  return {
    canResolve,
    canAutoApply: blocker === null,
    criteriaMet: criteria.met,
    autoApplyBlocker: blocker
  };
}

/**
 * `true` when the signed-in user created the thread.
 *
 * The API compares the caller's pseudonym with `createdByHash` and answers
 * `403 ERR_AUTHORIZATION_FAILED` otherwise.
 */
export function canCloseThread(thread: ThreadDto, authorHash: string | null): boolean {
  return authorHash !== null && authorHash !== '' && thread.createdByHash === authorHash;
}

/**
 * `true` when the signed-in user wrote the post.
 *
 * The API compares the caller's pseudonym with `authorHash` and answers
 * `403 ERR_AUTHORIZATION_FAILED` otherwise.
 */
export function canDeletePost(post: PostDto, authorHash: string | null): boolean {
  return authorHash !== null && authorHash !== '' && post.authorHash === authorHash;
}
