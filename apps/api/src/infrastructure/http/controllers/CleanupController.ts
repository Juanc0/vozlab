import { FastifyRequest, FastifyReply } from 'fastify';
import { CleanupExpiredInvitationsUseCase } from '../../../application/use_cases/CleanupExpiredInvitationsUseCase.js';
import { getTenantContext } from './requestContext.js';
import { sendError } from './errorResponse.js';

export class CleanupController {
  constructor(private readonly cleanup: CleanupExpiredInvitationsUseCase) {}

  async cleanupHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getTenantContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const body = (req.body ?? {}) as { inactiveGuestDays?: unknown };
    let inactiveGuestDays: number | undefined;
    if (body.inactiveGuestDays !== undefined) {
      const parsed = Number(body.inactiveGuestDays);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3650) {
        return sendError(reply, 'ERR_VALIDATION_FAILED');
      }
      inactiveGuestDays = parsed;
    }

    const result = await this.cleanup.execute({ tid: ctx.tid, inactiveGuestDays });
    return reply.status(200).send(result);
  }
}