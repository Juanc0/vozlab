import { FastifyRequest, FastifyReply } from 'fastify';
import { CleanupExpiredInvitationsUseCase } from '../../../application/use_cases/CleanupExpiredInvitationsUseCase.js';
import { getTenantContext } from './requestContext.js';
import { sendError } from './errorResponse.js';

export class CleanupController {
  constructor(private readonly cleanup: CleanupExpiredInvitationsUseCase) {}

  async cleanupHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getTenantContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const result = await this.cleanup.execute({ tid: ctx.tid });
    return reply.status(200).send(result);
  }
}