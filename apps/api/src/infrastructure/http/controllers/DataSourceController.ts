import { FastifyRequest, FastifyReply } from 'fastify';
import { IDataSourceRepository } from '../../../domain/ports/IDataSourceRepository.js';
import type { BehaviorProfile, ConnectorType } from '@vozlab/shared-types';
import { sendError, mapDomainError } from './errorResponse.js';
import { getRequestContext } from './requestContext.js';

export class DataSourceController {
  constructor(private readonly repo: IDataSourceRepository) {}

  async list(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const query = req.query as { workspaceId?: string };
    if (!query.workspaceId) return sendError(reply, 'ERR_VALIDATION_FAILED');

    try {
      const sources = await this.repo.listByWorkspace(query.workspaceId, ctx.tid);
      return reply.status(200).send({ sources });
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  async create(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const body = req.body as {
      workspaceId?: string;
      sourceKey?: string;
      connectorType?: string;
      behaviorProfile?: string;
      displayName?: string;
    };

    if (!body.workspaceId || !body.sourceKey || !body.displayName) {
      return sendError(reply, 'ERR_VALIDATION_FAILED');
    }

    try {
      const source = await this.repo.create(
        {
          workspaceId: body.workspaceId,
          sourceKey: body.sourceKey,
          connectorType: (body.connectorType ?? 'MINUTES') as ConnectorType,
          behaviorProfile: (body.behaviorProfile ?? 'BATCH') as BehaviorProfile,
          displayName: body.displayName,
        },
        ctx.tid
      );
      return reply.status(201).send(source);
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  async update(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const params = req.params as { id?: string };
    const body = req.body as Record<string, unknown>;
    if (!params.id) return sendError(reply, 'ERR_VALIDATION_FAILED');

    try {
      await this.repo.update(params.id, body as Partial<{ displayName: string; connectorType: ConnectorType; behaviorProfile: BehaviorProfile; status: string }>, ctx.tid);
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  async deactivate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const params = req.params as { id?: string };
    if (!params.id) return sendError(reply, 'ERR_VALIDATION_FAILED');

    try {
      await this.repo.deactivate(params.id, ctx.tid);
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }
}