import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateNodeSchema, buildError } from '@vozlab/shared-types';
import { CreateNodeUseCase } from '../../../application/use_cases/CreateNodeUseCase.js';
import { log } from '../../../shared/logger/index.js';

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
      const err = buildError('ERR_VALIDATION_FAILED');
      return reply.status(err.status).send({
        code: err.code,
        message: err.message,
        issues: parsed.error.issues,
      });
    }

    const workspaceId = req.workspaceId;
    const tid = req.tid;
    const authorHash = req.user?.authorHash;

    if (!workspaceId || !tid) {
      const err = buildError('ERR_MISSING_WORKSPACE_HEADER');
      return reply.status(err.status).send({ code: err.code, message: err.message });
    }

    try {
      const node = await this.createNodeUseCase.execute({
        ...parsed.data,
        workspaceId,
        tid,
        authorHash: authorHash ?? 'anonymous',
        reqId: req.reqId,
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
      const message = error instanceof Error ? error.message : 'unknown error';
      log.error({ err: message, reqId: req.id }, 'createNode failed');
      const err = buildError('ERR_INTERNAL_SERVER_ERROR');
      return reply.status(err.status).send({ code: err.code, message: err.message });
    }
  }
}
