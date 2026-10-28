import { FastifyRequest, FastifyReply } from 'fastify';
import {
  AddWorkspaceMemberSchema,
  ChangeWorkspaceMemberRoleSchema,
  UpdateWorkspaceSchema,
} from '@vozlab/shared-types';
import { GetWorkspaceUseCase } from '../../../application/use_cases/GetWorkspaceUseCase.js';
import { UpdateWorkspaceUseCase } from '../../../application/use_cases/UpdateWorkspaceUseCase.js';
import { RotateJoinCodeUseCase } from '../../../application/use_cases/RotateJoinCodeUseCase.js';
import { ListMembersUseCase } from '../../../application/use_cases/ListMembersUseCase.js';
import { AddWorkspaceMemberUseCase } from '../../../application/use_cases/AddWorkspaceMemberUseCase.js';
import { ChangeMemberRoleUseCase } from '../../../application/use_cases/ChangeMemberRoleUseCase.js';
import { AssignMemberRoleUseCase } from '../../../application/use_cases/AssignMemberRoleUseCase.js';
import { RemoveMemberRoleUseCase } from '../../../application/use_cases/RemoveMemberRoleUseCase.js';
import { SuspendMemberUseCase } from '../../../application/use_cases/SuspendMemberUseCase.js';
import { ReactivateMemberUseCase } from '../../../application/use_cases/ReactivateMemberUseCase.js';
import { RemoveMemberUseCase } from '../../../application/use_cases/RemoveMemberUseCase.js';
import {
  getRequestContext,
  targetWorkspaceId,
} from './requestContext.js';
import { mapDomainError, sendError } from './errorResponse.js';
import { toAdminMemberDto, toAdminWorkspaceDto } from './adminDtos.js';

/**
 * WorkspaceAdminController: configuration and membership of one workspace.
 *
 * Every route runs after `workspaceAdminGuard`; the use cases assert the
 * authority again with the tenant database.
 */
export class WorkspaceAdminController {
  constructor(
    private readonly getWorkspace: GetWorkspaceUseCase,
    private readonly updateWorkspace: UpdateWorkspaceUseCase,
    private readonly rotateJoinCode: RotateJoinCodeUseCase,
    private readonly listMembers: ListMembersUseCase,
    private readonly addMember: AddWorkspaceMemberUseCase,
    private readonly changeRole: ChangeMemberRoleUseCase,
    private readonly assignRole: AssignMemberRoleUseCase | null,
    private readonly removeRoleUseCase: RemoveMemberRoleUseCase | null,
    private readonly suspendMember: SuspendMemberUseCase,
    private readonly reactivateMember: ReactivateMemberUseCase,
    private readonly removeMember: RemoveMemberUseCase
  ) {}

  /** GET /api/v1/workspaces/:workspaceId */
  async getWorkspaceHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const workspace = await this.getWorkspace.execute({
        actorUserId: ctx.userId,
        tid: ctx.tid,
        workspaceId: targetWorkspaceId(req, ctx.workspaceId),
      });
      return reply.status(200).send(toAdminWorkspaceDto(workspace));
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /** PATCH /api/v1/workspaces/:workspaceId */
  async updateWorkspaceHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const parsed = UpdateWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', {
        issues: parsed.error.issues,
      });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const workspace = await this.updateWorkspace.execute({
        actorUserId: ctx.userId,
        tid: ctx.tid,
        workspaceId: targetWorkspaceId(req, ctx.workspaceId),
        patch: {
          name: parsed.data.name,
          description: parsed.data.description,
          isPublic: parsed.data.isPublic,
        },
      });
      return reply.status(200).send(toAdminWorkspaceDto(workspace));
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /** POST /api/v1/workspaces/:workspaceId/join-code/rotate */
  async rotateJoinCodeHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const workspace = await this.rotateJoinCode.execute({
        actorUserId: ctx.userId,
        tid: ctx.tid,
        workspaceId: targetWorkspaceId(req, ctx.workspaceId),
      });
      return reply.status(200).send({ joinCode: workspace.joinCode });
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /** GET /api/v1/workspaces/:workspaceId/members */
  async listMembersHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const members = await this.listMembers.execute({
        actorUserId: ctx.userId,
        tid: ctx.tid,
        workspaceId: targetWorkspaceId(req, ctx.workspaceId),
      });
      return reply
        .status(200)
        .send({ members: members.map(toAdminMemberDto) });
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /** POST /api/v1/workspaces/:workspaceId/members */
  async addMemberHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const parsed = AddWorkspaceMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', {
        issues: parsed.error.issues,
      });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      await this.addMember.execute({
        actorUserId: ctx.userId,
        tid: ctx.tid,
        workspaceId: targetWorkspaceId(req, ctx.workspaceId),
        email: parsed.data.email,
        handle: parsed.data.handle,
        globalUserId: parsed.data.globalUserId,
        role: parsed.data.role,
        reqId: ctx.reqId,
      });
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /** PATCH /api/v1/workspaces/:workspaceId/members/:userId */
  async assignRoleHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');
    if (!this.assignRole) return sendError(reply, 'ERR_VALIDATION_FAILED');
    const params = req.params as { workspaceId?: string; userId?: string };
    const workspaceId = targetWorkspaceId(req, ctx.workspaceId);
    const userId = params.userId;
    if (!userId) return sendError(reply, 'ERR_VALIDATION_FAILED');
    const body = (req.body ?? {}) as { role?: string };
    if (!body.role) return sendError(reply, 'ERR_VALIDATION_FAILED');
    try {
      await this.assignRole.execute({
        actorUserId: ctx.userId,
        tid: ctx.tid,
        workspaceId,
        targetUserId: userId,
        role: body.role as any,
      });
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  async removeRoleHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');
    if (!this.removeRoleUseCase) return sendError(reply, 'ERR_VALIDATION_FAILED');
    const params = req.params as { workspaceId?: string; userId?: string; role?: string };
    const workspaceId = targetWorkspaceId(req, ctx.workspaceId);
    const userId = params.userId;
    const role = params.role;
    if (!userId || !role) return sendError(reply, 'ERR_VALIDATION_FAILED');
    try {
      await this.removeRoleUseCase.execute({
        actorUserId: ctx.userId,
        tid: ctx.tid,
        workspaceId,
        targetUserId: userId,
        role: role as any,
      });
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  async changeRoleHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const params = req.params as { userId?: string };
    if (!params.userId) return sendError(reply, 'ERR_VALIDATION_FAILED');

    const parsed = ChangeWorkspaceMemberRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', {
        issues: parsed.error.issues,
      });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      await this.changeRole.execute({
        actorUserId: ctx.userId,
        tid: ctx.tid,
        workspaceId: targetWorkspaceId(req, ctx.workspaceId),
        targetUserId: params.userId,
        role: parsed.data.role,
        reqId: ctx.reqId,
      });
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /** POST /api/v1/workspaces/:workspaceId/members/:userId/suspend */
  async suspendMemberHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const params = req.params as { userId?: string };
    if (!params.userId) return sendError(reply, 'ERR_VALIDATION_FAILED');

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      await this.suspendMember.execute({
        actorUserId: ctx.userId,
        tid: ctx.tid,
        workspaceId: targetWorkspaceId(req, ctx.workspaceId),
        targetUserId: params.userId,
        reqId: ctx.reqId,
      });
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /** POST /api/v1/workspaces/:workspaceId/members/:userId/reactivate */
  async reactivateMemberHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const params = req.params as { userId?: string };
    if (!params.userId) return sendError(reply, 'ERR_VALIDATION_FAILED');

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      await this.reactivateMember.execute({
        actorUserId: ctx.userId,
        tid: ctx.tid,
        workspaceId: targetWorkspaceId(req, ctx.workspaceId),
        targetUserId: params.userId,
        reqId: ctx.reqId,
      });
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /** DELETE /api/v1/workspaces/:workspaceId/members/:userId */
  async removeMemberHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const params = req.params as { userId?: string };
    if (!params.userId) return sendError(reply, 'ERR_VALIDATION_FAILED');

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      await this.removeMember.execute({
        actorUserId: ctx.userId,
        tid: ctx.tid,
        workspaceId: targetWorkspaceId(req, ctx.workspaceId),
        targetUserId: params.userId,
        reqId: ctx.reqId,
      });
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }
}
