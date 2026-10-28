import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateWorkspaceJoinCodeUseCase } from '../../../application/use_cases/CreateWorkspaceJoinCodeUseCase.js';
import { getTenantContext } from './requestContext.js';
import { mapDomainError, sendError } from './errorResponse.js';

export class JoinCodeController {
  constructor(private readonly createCode: CreateWorkspaceJoinCodeUseCase) {}

  async createHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getTenantContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');
    const params = req.params as { workspaceId?: string };
    const workspaceId = params.workspaceId;
    if (!workspaceId) return sendError(reply, 'ERR_VALIDATION_FAILED');
    const body = (req.body ?? {}) as { label?: string; expiresAt?: string; maxUses?: number; autoApprove?: boolean };

    try {
      const result = await this.createCode.execute({
        actorUserId: ctx.userId,
        tid: ctx.tid,
        workspaceId,
        label: body.label ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        maxUses: body.maxUses ?? null,
        autoApprove: body.autoApprove ?? false,
      });
      return reply.status(201).send(result);
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }
}