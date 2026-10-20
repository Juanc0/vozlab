/**
 * The optimistic vote (FR-14, FR-15).
 *
 * The API has **no read, no retraction and no change-vote route** for the
 * interactions: once a vote is cast, the client cannot ask which one it
 * was. The vote state is therefore **local to the session**, and this
 * ledger is that state.
 *
 * The score of a target is modelled as
 *
 * ```text
 * score = serverScore + Σ (the deltas of the votes in flight)
 * ```
 *
 * - `serverScore` is the score the server last confirmed (or the score the
 *   UI read);
 * - a vote in flight has already moved the score **optimistically**, so the
 *   user sees the result of the click immediately;
 * - every pending vote keeps the **exact score the target had before it**
 *   (`before`), so a refusal restores that value — not an approximation of
 *   it.
 *
 * The arithmetic is deliberately not "subtract the delta on failure": with
 * two votes in flight, one of them failing must not erase the optimistic
 * delta of the other one. Removing the failed vote from the sum restores
 * the value the target had before that vote — which is the `before` value
 * whenever no other vote settled in between, and the only correct value
 * when one did.
 */

import { interactionValue } from '$lib/api/interactions';
import type { InteractionType } from '$lib/api/types';

/** A vote that is in flight. */
export interface PendingVote {
  /** The id of the vote — the counter of the ledger. */
  readonly id: number;
  /** The interaction type that was cast. */
  readonly interactionType: InteractionType;
  /** The score delta that was applied optimistically. */
  readonly delta: number;
  /** The exact score the target had before the optimistic update. */
  readonly before: number;
}

/** The vote state of one target. */
interface VoteEntry {
  /** The score the server last confirmed for the target. */
  serverScore: number;
  /** The interaction type the user already cast in this session, if any. */
  votedType: InteractionType | null;
  /** The votes that are in flight. */
  pending: PendingVote[];
}

/**
 * The session-local state of the votes.
 *
 * One instance per tab (the pages create it); it is **not** a module-level
 * singleton: on the server a singleton would leak one user's votes into
 * another user's request.
 */
export class VoteLedger {
  /** The vote state of every target, keyed by target id. */
  entries = $state<Record<string, VoteEntry>>({});

  /** The counter that names the pending votes. */
  #counter = 0;

  /** The score shown for a target — the server's score plus the pending deltas. */
  score(targetId: string, serverScore: number): number {
    const entry = this.entries[targetId];
    if (entry === undefined) {
      return serverScore;
    }
    return entry.serverScore + entry.pending.reduce((sum, vote) => sum + vote.delta, 0);
  }

  /** The interaction type the user already cast for the target, if any. */
  votedType(targetId: string): InteractionType | null {
    return this.entries[targetId]?.votedType ?? null;
  }

  /** `true` when a vote for the target is in flight. */
  isPending(targetId: string): boolean {
    return (this.entries[targetId]?.pending.length ?? 0) > 0;
  }

  /**
   * Records the score the server reported for a target.
   *
   * A fresh read wins — unless a vote is in flight: the server may or may
   * not have counted it yet (the confirmation is what removes it from the
   * pending votes), so the optimistic state is kept until the vote settles.
   * A read that arrives in that window is discarded; the next one wins.
   */
  sync(targetId: string, serverScore: number): void {
    const entry = this.entry(targetId, serverScore);
    if (entry.pending.length > 0) {
      return;
    }
    entry.serverScore = serverScore;
  }

  /**
   * Applies an optimistic vote: the score moves **before** the request goes
   * out, and the pending vote keeps the score it replaced.
   */
  applyOptimistic(
    targetId: string,
    serverScore: number,
    interactionType: InteractionType
  ): PendingVote {
    const entry = this.entry(targetId, serverScore);
    const before = this.score(targetId, serverScore);
    const delta = interactionValue(interactionType);

    this.#counter += 1;
    const vote: PendingVote = { id: this.#counter, interactionType, delta, before };
    entry.pending.push(vote);

    return vote;
  }

  /**
   * Confirms a vote.
   *
   * `counted` says whether the server moved the counter: a **new** vote
   * does, an **idempotent repeat** of the same type does not (the server
   * answers `201` with the existing row and leaves the counter alone). The
   * optimistic bump of a repeat is therefore undone — the score returns to
   * the value it had before the click.
   */
  confirm(targetId: string, vote: PendingVote, options: { readonly counted: boolean }): void {
    const entry = this.entries[targetId];
    if (entry === undefined) {
      return;
    }

    entry.pending = entry.pending.filter((candidate) => candidate.id !== vote.id);

    if (options.counted) {
      entry.serverScore += vote.delta;
      entry.votedType = vote.interactionType;
    }
  }

  /**
   * Rolls a vote back: the score returns to the value it had before the
   * optimistic update.
   */
  rollback(targetId: string, vote: PendingVote): void {
    const entry = this.entries[targetId];
    if (entry === undefined) {
      return;
    }

    entry.pending = entry.pending.filter((candidate) => candidate.id !== vote.id);
  }

  /** The entry of a target — created on the first access. */
  private entry(targetId: string, serverScore: number): VoteEntry {
    const existing = this.entries[targetId];
    if (existing !== undefined) {
      return existing;
    }

    const created: VoteEntry = { serverScore, votedType: null, pending: [] };
    this.entries = { ...this.entries, [targetId]: created };

    return this.entries[targetId];
  }
}
