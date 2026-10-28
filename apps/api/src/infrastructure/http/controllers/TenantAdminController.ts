import { FastifyRequest, FastifyReply } from 'fastify';
import {
  AdminUserListQuerySchema,
  CreateWorkspaceSchema,
} from '@vozlab/shared-types';
import { CreateWorkspaceUseCase } from '../../../application/use_cases/CreateWorkspaceUseCase.js';
import { ListWorkspacesUseCase } from '../../../application/use_cases/ListWorkspacesUseCase.js';
import { ListTenantUsersUseCase } from '../../../application/use_cases/ListTenantUsersUseCase.js';
import { getTenantContext } from './requestContext.js';
import { mapDomainError, sendError } from './errorResponse.js';
import { toAdminUserDto, toAdminWorkspaceDto } from './adminDtos.js';

/**
 * TenantAdminController: the tenant-wide administration surface (US-00).
 *
 * Every route here runs after `tenantAdminGuard`; the use cases assert the
 * role again so the rule holds even if a future route forgets the guard.
 */
export class TenantAdminController {
  constructor(
    private readonly listWorkspaces: ListWorkspacesUseCase,
    private readonly createWorkspace: CreateWorkspaceUseCase,
    private readonly listUsers: ListTenantUsersUseCase
  ) {}

  /** GET /api/v1/admin/workspaces */
  async listWorkspacesHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const ctx = getTenantContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const workspaces = await this.listWorkspaces.execute({
        actorUserId: ctx.userId,
        tid: ctx.tid,
      });
      return reply
        .status(200)
        .send({ workspaces: workspaces.map(toAdminWorkspaceDto) });
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /** POST /api/v1/admin/workspaces */
  async createWorkspaceHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const parsed = CreateWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', {
        issues: parsed.error.issues,
      });
    }

    const ctx = getTenantContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const workspace = await this.createWorkspace.execute({
        actorUserId: ctx.userId,
        actorAuthorHash: ctx.authorHash,
        tid: ctx.tid,
        name: parsed.data.name,
        slug: parsed.data.slug,
        description: parsed.data.description ?? null,
        isPublic: parsed.data.isPublic,
        reqId: ctx.reqId,
      });
      return reply.status(201).send(toAdminWorkspaceDto(workspace));
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /** GET /api/v1/admin/users?search=&limit=&cursor= */
  async listUsersHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const parsed = AdminUserListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', {
        issues: parsed.error.issues,
      });
    }

    const ctx = getTenantContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const result = await this.listUsers.execute({
        actorUserId: ctx.userId,
        tid: ctx.tid,
        search: parsed.data.search,
        limit: parsed.data.limit,
        cursor: parsed.data.cursor,
      });
      return reply.status(200).send({
        users: result.users.map(toAdminUserDto),
        nextCursor: result.nextCursor,
      });
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }
}
