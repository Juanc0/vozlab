import { FastifyRequest, FastifyReply } from 'fastify';
import { InviteToWorkspaceUseCase } from '../../../application/use_cases/InviteToWorkspaceUseCase.js';
import { IMembershipRepository } from '../../../domain/ports/IMembershipRepository.js';
import { IInvitationRepository } from '../../../domain/ports/IInvitationRepository.js';
import { sendError, mapDomainError } from './errorResponse.js';
import { getRequestContext } from './requestContext.js';

export class MembershipController {
  constructor(
    private readonly inviteUseCase: InviteToWorkspaceUseCase,
    private readonly membershipRepo: IMembershipRepository,
    private readonly invitationRepo: IInvitationRepository
  ) {}

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

  async changeRole(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const body = req.body as { userId?: string; role?: string };
    const workspaceId = (req.params as { workspaceId?: string }).workspaceId;

    if (!body.userId || !body.role || !workspaceId) {
      return sendError(reply, 'ERR_VALIDATION_FAILED');
    }

    try {
      await this.membershipRepo.changeRole(
        body.userId,
        workspaceId,
        body.role as any,
        ctx.tid
      );
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  async suspend(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const body = req.body as { userId?: string };
    const workspaceId = (req.params as { workspaceId?: string }).workspaceId;

    if (!body.userId || !workspaceId) {
      return sendError(reply, 'ERR_VALIDATION_FAILED');
    }

    try {
      await this.membershipRepo.suspend(body.userId, workspaceId, ctx.tid);
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  async reactivate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const body = req.body as { userId?: string };
    const workspaceId = (req.params as { workspaceId?: string }).workspaceId;

    if (!body.userId || !workspaceId) {
      return sendError(reply, 'ERR_VALIDATION_FAILED');
    }

    try {
      await this.membershipRepo.reactivate(body.userId, workspaceId, ctx.tid);
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  async expel(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const body = req.body as { userId?: string };
    const workspaceId = (req.params as { workspaceId?: string }).workspaceId;

    if (!body.userId || !workspaceId) {
      return sendError(reply, 'ERR_VALIDATION_FAILED');
    }

    try {
      await this.membershipRepo.remove(body.userId, workspaceId, ctx.tid);
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  async revokeInvitation(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const params = req.params as { invitationId?: string };

    if (!params.invitationId) {
      return sendError(reply, 'ERR_VALIDATION_FAILED');
    }

    try {
      await this.invitationRepo.revoke(params.invitationId, ctx.tid);
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }
}