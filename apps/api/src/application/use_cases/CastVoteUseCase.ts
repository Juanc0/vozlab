import { randomUUID } from 'node:crypto';
import { CastVoteInput as CastVoteDto } from '@vozlab/shared-types';
import {
  Interaction,
  InteractionTargetType,
} from '../../domain/entities/Interaction.js';
import { VoteValue } from '../../domain/value_objects/VoteValue.js';
import { DomainError, DomainErrorCode } from '../../domain/errors/DomainError.js';
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

    // A vote target that does not exist, or belongs to another workspace, is
    // indistinguishable from a missing one: 404, never 403 (TASK-22 rule).
    const targetExists = await this.interactionRepo.existsInWorkspace(
      input.targetId,
      input.targetType,
      input.workspaceId,
      input.tid
    );
    if (!targetExists) {
      throw new DomainError(notFoundCode(input.targetType));
    }

    // Derive the score delta from the interaction type (single source of truth).
    const value = VoteValue.fromInteractionType(input.interactionType).value;

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

/** Type-appropriate 404 code for an unavailable vote target (TASK-22 rule). */
function notFoundCode(targetType: InteractionTargetType): DomainErrorCode {
  switch (targetType) {
    case 'EDGE':
      return 'ERR_EDGE_NOT_FOUND';
    case 'PROPOSAL':
      return 'ERR_PROPOSAL_NOT_FOUND';
    case 'POST':
      return 'ERR_POST_NOT_FOUND';
    case 'NODE':
    default:
      return 'ERR_NODE_NOT_FOUND';
  }
}
