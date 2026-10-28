import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateGlobalInvitationUseCase } from '../../../application/use_cases/CreateGlobalInvitationUseCase.js';
import { getTenantContext } from './requestContext.js';
import { mapDomainError, sendError } from './errorResponse.js';

export class GlobalInvitationController {
  constructor(private readonly create: CreateGlobalInvitationUseCase) {}

  async createHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getTenantContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');
    const body = (req.body ?? {}) as { workspaceId?: string; email?: string; role?: string; expiresAt?: string; maxUses?: number };
    if (!body.workspaceId || !body.email || !body.role || !body.expiresAt) {
      return sendError(reply, 'ERR_VALIDATION_FAILED');
    }
    try {
      const result = await this.create.execute({
        tenantId: ctx.tid,
        workspaceId: body.workspaceId,
        email: body.email,
        role: body.role,
        expiresAt: new Date(body.expiresAt),
        maxUses: body.maxUses ?? null,
      });
      return reply.status(201).send(result);
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }
}