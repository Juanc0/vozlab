import { FastifyRequest, FastifyReply } from 'fastify';
import {
  ApproveJoinRequestSchema,
  CreateWorkspaceInvitationSchema,
  JoinRequestListQuerySchema,
  type CreateWorkspaceInvitationResultDto,
} from '@vozlab/shared-types';
import { env } from '../../../shared/config/env.js';
import { ListJoinRequestsUseCase } from '../../../application/use_cases/ListJoinRequestsUseCase.js';
import { ApproveJoinRequestUseCase } from '../../../application/use_cases/ApproveJoinRequestUseCase.js';
import { RejectJoinRequestUseCase } from '../../../application/use_cases/RejectJoinRequestUseCase.js';
import { ListInvitationsUseCase } from '../../../application/use_cases/ListInvitationsUseCase.js';
import { CreateInvitationUseCase } from '../../../application/use_cases/CreateInvitationUseCase.js';
import { RevokeInvitationUseCase } from '../../../application/use_cases/RevokeInvitationUseCase.js';
import {
  getRequestContext,
  targetWorkspaceId,
} from './requestContext.js';
import { mapDomainError, sendError } from './errorResponse.js';
import {
  toJoinRequestDto,
  toWorkspaceInvitationDto,
} from './adminDtos.js';

/**
 * WorkspaceAccessAdminController: the join-request inbox and the invitation
 * links of one workspace.
 *
 * Every route runs after `workspaceAdminGuard`. Invitations are the only
 * workspace-scoped resource addressed by its own id: the use case checks
 * that the invitation belongs to the header workspace.
 */
export class WorkspaceAccessAdminController {
  constructor(
    private readonly listJoinRequests: ListJoinRequestsUseCase,
    private readonly approveJoinRequest: ApproveJoinRequestUseCase,
    private readonly rejectJoinRequest: RejectJoinRequestUseCase,
    private readonly listInvitations: ListInvitationsUseCase,
    private readonly createInvitation: CreateInvitationUseCase,
    private readonly revokeInvitation: RevokeInvitationUseCase
  ) {}

  /** GET /api/v1/workspaces/:workspaceId/join-requests?status=&limit= */
  async listJoinRequestsHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const parsed = JoinRequestListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', {
        issues: parsed.error.issues,
      });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const requests = await this.listJoinRequests.execute({
        actorUserId: ctx.userId,
        tid: ctx.tid,
        workspaceId: targetWorkspaceId(req, ctx.workspaceId),
        status: parsed.data.status,
        limit: parsed.data.limit,
      });
      return reply
        .status(200)
        .send({ requests: requests.map(toJoinRequestDto) });
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /** POST /api/v1/workspaces/:workspaceId/join-requests/:requestId/approve */
  async approveJoinRequestHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const params = req.params as { requestId?: string };
    if (!params.requestId) return sendError(reply, 'ERR_VALIDATION_FAILED');

    const parsed = ApproveJoinRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', {
        issues: parsed.error.issues,
      });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      await this.approveJoinRequest.execute({
        actorUserId: ctx.userId,
        tid: ctx.tid,
        workspaceId: targetWorkspaceId(req, ctx.workspaceId),
        requestId: params.requestId,
        role: parsed.data.role,
        reqId: ctx.reqId,
      });
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /** POST /api/v1/workspaces/:workspaceId/join-requests/:requestId/reject */
  async rejectJoinRequestHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const params = req.params as { requestId?: string };
    if (!params.requestId) return sendError(reply, 'ERR_VALIDATION_FAILED');

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      await this.rejectJoinRequest.execute({
        actorUserId: ctx.userId,
        tid: ctx.tid,
        workspaceId: targetWorkspaceId(req, ctx.workspaceId),
        requestId: params.requestId,
        reqId: ctx.reqId,
      });
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /** GET /api/v1/workspaces/:workspaceId/invitations */
  async listInvitationsHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const invitations = await this.listInvitations.execute({
        actorUserId: ctx.userId,
        tid: ctx.tid,
        workspaceId: targetWorkspaceId(req, ctx.workspaceId),
      });
      return reply
        .status(200)
        .send({ invitations: invitations.map(toWorkspaceInvitationDto) });
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /** POST /api/v1/workspaces/:workspaceId/invitations */
  async createInvitationHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const parsed = CreateWorkspaceInvitationSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', {
        issues: parsed.error.issues,
      });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const { invitation, token } = await this.createInvitation.execute({
        actorUserId: ctx.userId,
        tid: ctx.tid,
        workspaceId: targetWorkspaceId(req, ctx.workspaceId),
        email: parsed.data.email,
        role: parsed.data.role,
        reqId: ctx.reqId,
      });

      const url = new URL('/login', env.WEB_ORIGIN);
      url.searchParams.set('invitation', token);

      const body: CreateWorkspaceInvitationResultDto = {
        invitation: toWorkspaceInvitationDto(invitation),
        url: url.toString(),
      };
      return reply.status(201).send(body);
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /** DELETE /api/v1/invitations/:invitationId */
  async revokeInvitationHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const params = req.params as { invitationId?: string };
    if (!params.invitationId) return sendError(reply, 'ERR_VALIDATION_FAILED');

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      await this.revokeInvitation.execute({
        actorUserId: ctx.userId,
        tid: ctx.tid,
        workspaceId: targetWorkspaceId(req, ctx.workspaceId),
        invitationId: params.invitationId,
        reqId: ctx.reqId,
      });
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }
}
