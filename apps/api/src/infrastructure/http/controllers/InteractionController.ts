import { FastifyRequest, FastifyReply } from 'fastify';
import { CastVoteSchema, type InteractionDto } from '@vozlab/shared-types';
import { CastVoteUseCase } from '../../../application/use_cases/CastVoteUseCase.js';
import { Interaction } from '../../../domain/entities/Interaction.js';
import { log } from '../../../shared/logger/index.js';
import { getRequestContext } from './requestContext.js';
import { sendError, mapDomainError } from './errorResponse.js';

/**
 * Stable JSON projection of an Interaction. Never leaks the raw entity
 * internals (e.g. the `AuthorHash` value object) — the pseudonym is not part
 * of the response at all.
 *
 * The shape itself lives in `@vozlab/shared-types` (`InteractionDto`) so the
 * PWA can type the responses it consumes.
 */
function toInteractionDto(interaction: Interaction): InteractionDto {
  return {
    id: interaction.id,
    targetId: interaction.targetId,
    targetType: interaction.targetType,
    interactionType: interaction.interactionType,
    value: interaction.value,
  };
}

/**
 * InteractionController: HTTP adapter for community votes (RF-14).
 */
export class InteractionController {
  constructor(private readonly castVote: CastVoteUseCase) {}

  /** POST /api/v1/interactions */
  async vote(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = CastVoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const interaction = await this.castVote.execute({
        ...parsed.data,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        userHash: ctx.authorHash,
        reqId: ctx.reqId,
      });

      return reply.status(201).send(toInteractionDto(interaction));
    } catch (error) {
      log.error(
        { err: error instanceof Error ? error.message : error, reqId: ctx.reqId },
        'castVote failed'
      );
      return sendError(reply, mapDomainError(error));
    }
  }
}
