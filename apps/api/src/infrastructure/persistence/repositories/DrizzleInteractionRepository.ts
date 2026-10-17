import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  nodes,
  edges,
  editProposals,
  discussionPosts,
  discussionThreads,
  interactionsLog,
} from '@vozlab/database';
import {
  Interaction,
  InteractionTargetType,
  InteractionType,
} from '../../../domain/entities/Interaction.js';
import { AuthorHash } from '../../../domain/value_objects/AuthorHash.js';
import { DomainError } from '../../../domain/errors/DomainError.js';
import { IInteractionRepository } from '../../../domain/ports/IInteractionRepository.js';
import { ConnectionPoolManager } from '../ConnectionPoolManager.js';

/**
 * DrizzleInteractionRepository: persists the immutable interactions log and
 * applies O(1) increments to the target's denormalized `community_score`
 * (RF-14, RF-15). Scoped by `tid`.
 */
export class DrizzleInteractionRepository implements IInteractionRepository {
  constructor(private readonly poolManager: ConnectionPoolManager) {}

  private async client(tid: string, tx?: any) {
    return tx ?? (await this.poolManager.getDb(tid));
  }

  async findByUserAndTarget(
    userHash: string,
    targetId: string,
    targetType: string,
    tid: string
  ): Promise<Interaction | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select()
      .from(interactionsLog)
      .where(
        sql`${interactionsLog.userHash} = ${userHash}
            AND ${interactionsLog.targetId} = ${targetId}
            AND ${interactionsLog.targetType} = ${targetType}`
      )
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async existsInWorkspace(
    targetId: string,
    targetType: InteractionTargetType,
    workspaceId: string,
    tid: string
  ): Promise<boolean> {
    const db = await this.client(tid);

    switch (targetType) {
      case 'NODE': {
        const [row] = await db
          .select({ id: nodes.id })
          .from(nodes)
          .where(
            and(
              eq(nodes.id, targetId),
              eq(nodes.workspaceId, workspaceId),
              isNull(nodes.deletedAt)
            )
          )
          .limit(1);
        return !!row;
      }
      case 'EDGE': {
        const [row] = await db
          .select({ id: edges.id })
          .from(edges)
          .where(
            and(
              eq(edges.id, targetId),
              eq(edges.workspaceId, workspaceId),
              isNull(edges.deletedAt)
            )
          )
          .limit(1);
        return !!row;
      }
      case 'PROPOSAL': {
        // edit_proposals has no `deletedAt` column.
        const [row] = await db
          .select({ id: editProposals.id })
          .from(editProposals)
          .where(
            and(
              eq(editProposals.id, targetId),
              eq(editProposals.workspaceId, workspaceId)
            )
          )
          .limit(1);
        return !!row;
      }
      case 'POST': {
        // `discussion_posts` has no `workspaceId`: scope it through its thread.
        const [row] = await db
          .select({ id: discussionPosts.id })
          .from(discussionPosts)
          .innerJoin(
            discussionThreads,
            eq(discussionPosts.threadId, discussionThreads.id)
          )
          .where(
            and(
              eq(discussionPosts.id, targetId),
              eq(discussionThreads.workspaceId, workspaceId),
              isNull(discussionPosts.deletedAt)
            )
          )
          .limit(1);
        return !!row;
      }
      default:
        return false;
    }
  }

  async save(interaction: Interaction, tid: string, tx?: any): Promise<void> {
    const db = await this.client(tid, tx);
    await db.insert(interactionsLog).values({
      id: interaction.id,
      workspaceId: interaction.workspaceId,
      userHash: interaction.userHash.toString(),
      targetId: interaction.targetId,
      targetType: interaction.targetType,
      interactionType: interaction.interactionType,
      value: interaction.value,
      createdAt: interaction.createdAt,
    });
  }

  async applyScoreDelta(
    targetId: string,
    targetType: string,
    delta: number,
    tid: string,
    tx?: any
  ): Promise<void> {
    const db = await this.client(tid, tx);

    switch (targetType) {
      case 'NODE':
        await db
          .update(nodes)
          .set({ communityScore: sql`${nodes.communityScore} + ${delta}` })
          .where(eq(nodes.id, targetId));
        break;
      case 'EDGE':
        await db
          .update(edges)
          .set({ communityScore: sql`${edges.communityScore} + ${delta}` })
          .where(eq(edges.id, targetId));
        break;
      case 'PROPOSAL':
        await db
          .update(editProposals)
          .set({
            communityScore: sql`${editProposals.communityScore} + ${delta}`,
          })
          .where(eq(editProposals.id, targetId));
        break;
      case 'POST': {
        // Single source of truth for post counters. A duplicate updater used
        // to live on the discussion repository but was never called; it was
        // removed so only one code path maintains these columns. An upvote
        // increments `upvotes`, a downvote increments `downvotes`, and
        // `community_score` is maintained as `upvotes - downvotes`.
        const up = delta > 0 ? 1 : 0;
        const down = delta < 0 ? 1 : 0;
        await db
          .update(discussionPosts)
          .set({
            upvotes: sql`${discussionPosts.upvotes} + ${up}`,
            downvotes: sql`${discussionPosts.downvotes} + ${down}`,
            communityScore: sql`${discussionPosts.communityScore} + ${up - down}`,
          })
          .where(eq(discussionPosts.id, targetId));
        break;
      }
      default:
        throw new DomainError(
          'ERR_VALIDATION_FAILED',
          `unsupported target type: ${targetType}`
        );
    }
  }
}

function toDomain(row: typeof interactionsLog.$inferSelect): Interaction {
  return new Interaction(
    row.id,
    row.workspaceId,
    AuthorHash.fromString(row.userHash),
    row.targetId,
    row.targetType as InteractionTargetType,
    row.interactionType as InteractionType,
    row.value,
    row.createdAt
  );
}
