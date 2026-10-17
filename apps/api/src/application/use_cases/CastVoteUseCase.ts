import { randomUUID } from 'node:crypto';
import { CastVoteInput as CastVoteDto } from '@vozlab/shared-types';
import { Interaction } from '../../domain/entities/Interaction.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { resolveAuthorHash } from '../services/resolveAuthorHash.js';
import { IInteractionRepository } from '../../domain/ports/IInteractionRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type CastVoteInput = CastVoteDto & {
  workspaceId: string;
  tid: string;
  userHash: string;
  reqId?: string;
};

/**
 * Use Case: cast a vote on any governance target (RF-14, RF-15).
 *
 * Idempotent for the same vote type; a different vote type is rejected to
 * honor the `unique_user_target_vote` constraint (immutable log). The
 * interaction insert and the denormalized score increment share one
 * UnitOfWork transaction.
 */
export class CastVoteUseCase {
  constructor(
    private readonly interactionRepo: IInteractionRepository,
    private readonly uow: IUnitOfWork,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: CastVoteInput): Promise<Interaction> {
    const existing = await this.interactionRepo.findByUserAndTarget(
      input.userHash,
      input.targetId,
      input.targetType,
      input.tid
    );

    if (existing) {
      if (existing.interactionType === input.interactionType) {
        return existing; // idempotent
      }
      throw new DomainError('ERR_DUPLICATE_INTERACTION');
    }

    // Derive the score delta from the interaction type (single source of truth).
    const value = input.interactionType === 'DOWNVOTE' ? -1 : 1;

    const interaction = new Interaction(
      randomUUID(),
      input.workspaceId,
      resolveAuthorHash(input.userHash, input.userHash),
      input.targetId,
      input.targetType,
      input.interactionType,
      value
    );

    await this.uow.runInTransaction(input.tid, async (tx) => {
      await this.interactionRepo.save(interaction, input.tid, tx);
      await this.interactionRepo.applyScoreDelta(
        input.targetId,
        input.targetType,
        value,
        input.tid,
        tx
      );
    });

    await this.eventPublisher.publish('INTERACTION_CAST', {
      reqId: input.reqId ?? '',
      interactionId: interaction.id,
      targetId: interaction.targetId,
      targetType: interaction.targetType,
      interactionType: interaction.interactionType,
      workspaceId: interaction.workspaceId,
    });

    return interaction;
  }
}
