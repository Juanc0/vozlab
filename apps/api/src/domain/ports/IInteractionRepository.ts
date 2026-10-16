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
   * Applies a delta to the target entity's denormalized `community_score`
   * column (nodes, edges, proposals or discussion posts). O(1) update (RF-15).
   */
  applyScoreDelta(
    targetId: string,
    targetType: string,
    delta: number,
    tid: string,
    tx?: any
  ): Promise<void>;
}
