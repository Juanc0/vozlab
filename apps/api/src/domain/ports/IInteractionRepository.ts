import { Interaction } from '../entities/Interaction.js';

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
  save(interaction: Interaction, tid: string, tx?: any): Promise<void>;
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
    tx?: any
  ): Promise<void>;
}
