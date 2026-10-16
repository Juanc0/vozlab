import { FastifyRequest, FastifyReply } from 'fastify';
import { ProposeOntologyClassSchema } from '@vozlab/shared-types';
import { ProposeOntologyClassUseCase } from '../../../application/use_cases/ProposeOntologyClassUseCase.js';
import { log } from '../../../shared/logger/index.js';
import { getRequestContext } from './requestContext.js';
import { sendError, mapDomainError } from './errorResponse.js';

/**
 * OntologyController: HTTP adapter for collaborative ontology proposals (RF-09).
 */
export class OntologyController {
  constructor(private readonly proposeClass: ProposeOntologyClassUseCase) {}

  /** POST /api/v1/ontology/classes */
  async proposeClassHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = ProposeOntologyClassSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_MISSING_WORKSPACE_HEADER');

    try {
      const cls = await this.proposeClass.execute({
        ...parsed.data,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        proposerHash: ctx.authorHash,
        reqId: ctx.reqId,
      });

      return reply.status(201).send({
        id: cls.id,
        systemKey: cls.systemKey,
        status: cls.status,
      });
    } catch (error) {
      log.error(
        { err: error instanceof Error ? error.message : error, reqId: ctx.reqId },
        'proposeOntologyClass failed'
      );
      return sendError(reply, mapDomainError(error));
    }
  }
}
