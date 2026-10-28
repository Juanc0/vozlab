import { FastifyRequest, FastifyReply } from 'fastify';
import { RequestWorkspaceAccessSchema } from '@vozlab/shared-types';
import { DiscoverWorkspacesUseCase } from '../../../application/use_cases/DiscoverWorkspacesUseCase.js';
import { RequestWorkspaceAccessUseCase } from '../../../application/use_cases/RequestWorkspaceAccessUseCase.js';
import { ListMyJoinRequestsUseCase } from '../../../application/use_cases/ListMyJoinRequestsUseCase.js';
import { getTenantContext } from './requestContext.js';
import { mapDomainError, sendError } from './errorResponse.js';
import {
  toDiscoveredWorkspaceDto,
  toMyJoinRequestDto,
} from './adminDtos.js';

/**
 * WorkspaceAccessController: what a tenant user can do **without** belonging
 * to a workspace (US-00).
 *
 * These routes require a session and a tenant, but not `X-Workspace-ID`:
 * the user who needs them most is exactly the one with no workspace yet.
 */
export class WorkspaceAccessController {
  constructor(
    private readonly discoverWorkspaces: DiscoverWorkspacesUseCase,
    private readonly requestAccess: RequestWorkspaceAccessUseCase,
    private readonly listMyRequests: ListMyJoinRequestsUseCase
  ) {}

  /** GET /api/v1/workspace-discovery */
  async discoverHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const ctx = getTenantContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const workspaces = await this.discoverWorkspaces.execute({
        userId: ctx.userId,
        tid: ctx.tid,
      });
      return reply
        .status(200)
        .send({ workspaces: workspaces.map(toDiscoveredWorkspaceDto) });
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /** POST /api/v1/workspace-join-requests */
  async requestAccessHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const parsed = RequestWorkspaceAccessSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', {
        issues: parsed.error.issues,
      });
    }

    const ctx = getTenantContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const request = await this.requestAccess.execute({
        userId: ctx.userId,
        tid: ctx.tid,
        workspaceId: parsed.data.workspaceId,
        code: parsed.data.code,
        message: parsed.data.message,
      });
      return reply.status(201).send(toMyJoinRequestDto(request));
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /** GET /api/v1/workspace-join-requests */
  async listMyRequestsHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const ctx = getTenantContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const requests = await this.listMyRequests.execute({
        userId: ctx.userId,
        tid: ctx.tid,
      });
      return reply
        .status(200)
        .send({ requests: requests.map(toMyJoinRequestDto) });
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }
}
