import { FastifyRequest, FastifyReply } from 'fastify';
import { ResolveSourceQuerySchema } from '@vozlab/shared-types';
import { ResolveSourceUseCase } from '../../../application/use_cases/ResolveSourceUseCase.js';
import { IngestSourceUseCase } from '../../../application/use_cases/IngestSourceUseCase.js';
import { log } from '../../../shared/logger/index.js';
import { mapDomainError, sendError } from './errorResponse.js';
import { getRequestContext } from './requestContext.js';

/**
 * IngestionController: HTTP adapter for the ingestion plumbing (ADR-0009,
 * ADR-0025, ADR-0035).
 */
export class IngestionController {
  constructor(
    private readonly resolveSourceUseCase: ResolveSourceUseCase,
    private readonly ingestSourceUseCase?: IngestSourceUseCase
  ) {}

  async resolveSource(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = ResolveSourceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const tid = req.tid;
    if (!tid) return sendError(reply, 'ERR_INTERNAL_SERVER_ERROR');

    try {
      const source = await this.resolveSourceUseCase.execute({
        sourceKey: parsed.data.sourceId,
        tid,
      });

      return reply.status(200).send({
        sourceId: source.sourceKey,
        workspaceId: source.workspaceId,
        connectorType: source.connectorType,
        behaviorProfile: source.behaviorProfile,
        displayName: source.displayName,
      });
    } catch (error) {
      log.error(
        { err: error instanceof Error ? error.message : error, reqId: req.reqId },
        'resolveSource failed'
      );
      return sendError(reply, mapDomainError(error));
    }
  }

  async ingest(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!this.ingestSourceUseCase) return sendError(reply, 'ERR_INTERNAL_SERVER_ERROR');

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const body = req.body as { sourceKey?: string; payload?: unknown };
    if (!body.sourceKey || body.payload === undefined) {
      return sendError(reply, 'ERR_VALIDATION_FAILED');
    }

    try {
      const result = await this.ingestSourceUseCase.execute({
        sourceKey: body.sourceKey,
        payload: body.payload,
        tid: ctx.tid,
      });
      return reply.status(202).send(result);
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }
}