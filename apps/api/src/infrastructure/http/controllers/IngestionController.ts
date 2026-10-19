import { FastifyRequest, FastifyReply } from 'fastify';
import { ResolveSourceQuerySchema } from '@vozlab/shared-types';
import { ResolveSourceUseCase } from '../../../application/use_cases/ResolveSourceUseCase.js';
import { log } from '../../../shared/logger/index.js';
import { mapDomainError, sendError } from './errorResponse.js';

/**
 * IngestionController: HTTP adapter for the ingestion plumbing.
 *
 * Today it exposes the source resolution route of ADR-0025 — the route that
 * turns an external `sourceId` into the workspace that owns it, so the
 * Extractor never chooses a workspace (ADR-0009).
 */
export class IngestionController {
  constructor(private readonly resolveSourceUseCase: ResolveSourceUseCase) {}

  /**
   * GET /api/v1/ingestion/resolve-source?sourceId=…
   *
   * 200 with the workspace and the per-source behavior; 404 for an unknown
   * or inactive source. The route is agent-only and tenant-scoped — it does
   * not take an `X-Workspace-ID` header, because the workspace is the answer.
   */
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
}
