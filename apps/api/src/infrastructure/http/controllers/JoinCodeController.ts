import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateWorkspaceJoinCodeUseCase } from '../../../application/use_cases/CreateWorkspaceJoinCodeUseCase.js';
import { UpdateWorkspaceJoinCodeUseCase } from '../../../application/use_cases/UpdateWorkspaceJoinCodeUseCase.js';
import { IWorkspaceJoinCodeRepository } from '../../../domain/ports/IWorkspaceJoinCodeRepository.js';
import { getTenantContext } from './requestContext.js';
import { mapDomainError, sendError } from './errorResponse.js';

export class JoinCodeController {
  constructor(
    private readonly createCode: CreateWorkspaceJoinCodeUseCase,
    private readonly codeRepo?: IWorkspaceJoinCodeRepository,
    private readonly updateCode?: UpdateWorkspaceJoinCodeUseCase
  ) {}

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

  async listHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getTenantContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');
    const params = req.params as { workspaceId?: string };
    const workspaceId = params.workspaceId;
    if (!workspaceId) return sendError(reply, 'ERR_VALIDATION_FAILED');
    if (!this.codeRepo) return sendError(reply, 'ERR_VALIDATION_FAILED');
    try {
      const codes = await this.codeRepo.list(workspaceId, ctx.tid);
      return reply.status(200).send({ codes });
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  async revokeHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getTenantContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');
    const params = req.params as { codeId?: string };
    const codeId = params.codeId;
    if (!codeId) return sendError(reply, 'ERR_VALIDATION_FAILED');
    if (!this.codeRepo) return sendError(reply, 'ERR_VALIDATION_FAILED');
    try {
      await this.codeRepo.revoke(codeId, ctx.tid);
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /**
   * PATCH /api/v1/workspaces/:workspaceId/join-codes/:codeId (v6/TASK-04, B6).
   * Patches the mutable attributes of a code — label, expiry, cap and the
   * auto-approve flag. The secret itself is never updated: rotating is a
   * revoke + create.
   */
  async updateHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getTenantContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');
    const params = req.params as { workspaceId?: string; codeId?: string };
    if (!params.workspaceId || !params.codeId) {
      return sendError(reply, 'ERR_VALIDATION_FAILED');
    }
    if (!this.updateCode) return sendError(reply, 'ERR_VALIDATION_FAILED');
    const body = (req.body ?? {}) as {
      label?: string | null;
      expiresAt?: string | null;
      maxUses?: number | null;
      autoApprove?: boolean;
    };

    const patch: {
      label?: string | null;
      expiresAt?: Date | null;
      maxUses?: number | null;
      autoApprove?: boolean;
    } = {};
    if (body.label !== undefined) patch.label = body.label;
    if (body.expiresAt !== undefined) {
      patch.expiresAt =
        body.expiresAt === null ? null : new Date(body.expiresAt);
      if (patch.expiresAt !== null && Number.isNaN(patch.expiresAt.getTime())) {
        return sendError(reply, 'ERR_VALIDATION_FAILED');
      }
    }
    if (body.maxUses !== undefined) patch.maxUses = body.maxUses;
    if (body.autoApprove !== undefined) patch.autoApprove = body.autoApprove;

    try {
      const updated = await this.updateCode.execute({
        actorUserId: ctx.userId,
        tid: ctx.tid,
        workspaceId: params.workspaceId,
        codeId: params.codeId,
        patch,
      });
      return reply
        .status(200)
        .send({
          id: updated.id,
          workspaceId: updated.workspaceId,
          label: updated.label,
          expiresAt: updated.expiresAt,
          maxUses: updated.maxUses,
          usedCount: updated.usedCount,
          autoApprove: updated.autoApprove,
          revokedAt: updated.revokedAt,
        });
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }
}