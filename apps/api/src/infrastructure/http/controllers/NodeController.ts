import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateNodeSchema } from '@vozlab/shared-types';
import { CreateNodeUseCase } from '../../../application/use_cases/CreateNodeUseCase.js';
import { log } from '../../../shared/logger/index.js';
import { getRequestContext } from './requestContext.js';
import { sendError, mapDomainError } from './errorResponse.js';

/**
 * NodeController: HTTP adapter for node-related endpoints.
 * Translates HTTP requests into use-case invocations and maps domain
 * results/errors back to HTTP responses.
 */
export class NodeController {
  constructor(private readonly createNodeUseCase: CreateNodeUseCase) {}

  /**
   * POST /api/v1/nodes
   * Creates a new node owned by the authenticated author within the
   * workspace resolved by TenantWorkspaceGuard (req.tid / req.workspaceId).
   */
  async createNode(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = CreateNodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_MISSING_WORKSPACE_HEADER');

    try {
      const node = await this.createNodeUseCase.execute({
        ...parsed.data,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        authorHash: ctx.authorHash,
        reqId: ctx.reqId,
      });

      return reply.status(201).send({
        id: node.id,
        workspaceId: node.workspaceId,
        typeKey: node.typeKey,
        title: node.title,
        description: node.description,
        status: node.status,
      });
    } catch (error) {
      log.error(
        { err: error instanceof Error ? error.message : error, reqId: ctx.reqId },
        'createNode failed'
      );
      return sendError(reply, mapDomainError(error));
    }
  }
}
