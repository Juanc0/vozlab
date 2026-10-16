import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateEdgeSchema } from '@vozlab/shared-types';
import { CreateEdgeUseCase } from '../../../application/use_cases/CreateEdgeUseCase.js';
import { log } from '../../../shared/logger/index.js';
import { getRequestContext } from './requestContext.js';
import { sendError, mapDomainError } from './errorResponse.js';

/**
 * EdgeController: HTTP adapter for directed relations between nodes (RF-08).
 */
export class EdgeController {
  constructor(private readonly createEdge: CreateEdgeUseCase) {}

  /** POST /api/v1/edges */
  async create(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = CreateEdgeSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_MISSING_WORKSPACE_HEADER');

    try {
      const edge = await this.createEdge.execute({
        ...parsed.data,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        authorHash: ctx.authorHash,
        reqId: ctx.reqId,
      });

      return reply.status(201).send({
        id: edge.id,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        relationKey: edge.relationKey,
        status: edge.status,
      });
    } catch (error) {
      log.error(
        { err: error instanceof Error ? error.message : error, reqId: ctx.reqId },
        'createEdge failed'
      );
      return sendError(reply, mapDomainError(error));
    }
  }
}
