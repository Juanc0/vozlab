import { DbTransaction } from './Transaction.js';
import {
  Interaction,
  InteractionTargetType,
} from '../entities/Interaction.js';

/**
 * Port: interactions log persistence (RF-14, RF-15).
 * Scoped by `tid` (physical tenant DB).
 */
export interface IInteractionRepository {
  findByUserAndTarget(
    userHash: string,
    targetId: string,
    targetType: string,
    tid: string
  ): Promise<Interaction | null>;
  /**
   * Returns whether the vote target exists in the given workspace.
   * Never throws on a missing row: it returns `false` (foreign-workspace and
   * soft-deleted targets are indistinguishable from absent ones -> 404).
   */
  existsInWorkspace(
    targetId: string,
    targetType: InteractionTargetType,
    workspaceId: string,
    tid: string
  ): Promise<boolean>;
  save(interaction: Interaction, tid: string, tx?: DbTransaction): Promise<void>;
  /**
   * Applies a delta to the target entity's denormalized counters (RF-15).
   * Always a `sql`-level `+=` (never read-modify-write) so the update stays
   * O(1) and concurrency-safe. For `NODE`/`EDGE`/`PROPOSAL` only
   * `community_score` changes; for `POST` the `upvotes`/`downvotes`/
   * `community_score` trio is kept coherent (this is the single
   * implementation — see `DrizzleInteractionRepository`).
   */
  applyScoreDelta(
    targetId: string,
    targetType: string,
    delta: number,
    tid: string,
    tx?: DbTransaction
  ): Promise<void>;
  /**
   * Distinct institutional supporters of a target (G3). Counts distinct
   * `author_hash` values among `interactions_log` rows with the given
   * `targetType`/`interactionType = 'SUPPORT'`. Anonymous event members
   * (`ANONYMOUS_EVENT` users) are excluded.
   *
   * Returns either the count (number) or, when the caller prefers, the
   * list of distinct hashes — fakes may return either form.
   */
  countDistinctSupporters(
    targetId: string,
    targetType: string,
    workspaceId: string,
    tid: string
  ): Promise<number | string[]>;
}
