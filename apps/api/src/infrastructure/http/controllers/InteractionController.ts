import { FastifyRequest, FastifyReply } from 'fastify';
import { CastVoteSchema } from '@vozlab/shared-types';
import { CastVoteUseCase } from '../../../application/use_cases/CastVoteUseCase.js';
import { log } from '../../../shared/logger/index.js';
import { getRequestContext } from './requestContext.js';
import { sendError, mapDomainError } from './errorResponse.js';

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
    if (!ctx) return sendError(reply, 'ERR_MISSING_WORKSPACE_HEADER');

    try {
      const interaction = await this.castVote.execute({
        ...parsed.data,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        userHash: ctx.authorHash,
        reqId: ctx.reqId,
      });

      return reply.status(201).send({
        id: interaction.id,
        targetId: interaction.targetId,
        targetType: interaction.targetType,
        interactionType: interaction.interactionType,
        value: interaction.value,
      });
    } catch (error) {
      log.error(
        { err: error instanceof Error ? error.message : error, reqId: ctx.reqId },
        'castVote failed'
      );
      return sendError(reply, mapDomainError(error));
    }
  }
}
