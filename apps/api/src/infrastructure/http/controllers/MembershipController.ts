import { FastifyRequest, FastifyReply } from 'fastify';
import { InviteToWorkspaceUseCase } from '../../../application/use_cases/InviteToWorkspaceUseCase.js';
import { sendError, mapDomainError } from './errorResponse.js';
import { getRequestContext } from './requestContext.js';

export class MembershipController {
  constructor(private readonly inviteUseCase: InviteToWorkspaceUseCase) {}

  async invite(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const body = req.body as { email?: string; role?: string; workspaceId?: string };

    if (!body.workspaceId || !body.role) {
      return sendError(reply, 'ERR_VALIDATION_FAILED');
    }

    try {
      const result = await this.inviteUseCase.execute({
        workspaceId: body.workspaceId,
        email: body.email ?? null,
        role: body.role,
        createdBy: ctx.userId,
        tid: ctx.tid,
      });
      return reply.status(201).send(result);
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }
}