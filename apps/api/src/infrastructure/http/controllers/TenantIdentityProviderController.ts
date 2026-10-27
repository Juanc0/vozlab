import { FastifyRequest, FastifyReply } from 'fastify';
import { ITenantIdentityProviderRepository } from '../../../domain/ports/ITenantIdentityProviderRepository.js';
import { sendError, mapDomainError } from './errorResponse.js';
import { getRequestContext } from './requestContext.js';

export class TenantIdentityProviderController {
  constructor(private readonly repo: ITenantIdentityProviderRepository) {}

  async list(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const providers = await this.repo.listByTenant(ctx.tid);
      return reply.status(200).send({ providers });
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  async create(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const body = req.body as {
      providerKind?: string;
      issuer?: string;
      clientId?: string;
      metadataUrl?: string;
    };

    if (!body.providerKind || !body.issuer) {
      return sendError(reply, 'ERR_VALIDATION_FAILED');
    }

    try {
      const provider = await this.repo.createProvider({
        tenantId: ctx.tid,
        providerKind: body.providerKind as any,
        issuer: body.issuer,
        clientId: body.clientId ?? null,
        metadataUrl: body.metadataUrl ?? null,
      });
      return reply.status(201).send(provider);
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  async setEnabled(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const params = req.params as { id?: string };
    const body = req.body as { enabled?: boolean };

    if (!params.id || body.enabled === undefined) {
      return sendError(reply, 'ERR_VALIDATION_FAILED');
    }

    try {
      await this.repo.setEnabled(params.id, body.enabled);
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }
}
