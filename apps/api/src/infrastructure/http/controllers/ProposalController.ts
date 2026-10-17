import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateProposalSchema } from '@vozlab/shared-types';
import { CreateProposalUseCase } from '../../../application/use_cases/CreateProposalUseCase.js';
import { ApproveProposalUseCase } from '../../../application/use_cases/ApproveProposalUseCase.js';
import { RejectProposalUseCase } from '../../../application/use_cases/RejectProposalUseCase.js';
import { AutoApplyProposalUseCase } from '../../../application/use_cases/AutoApplyProposalUseCase.js';
import { log } from '../../../shared/logger/index.js';
import { getRequestContext } from './requestContext.js';
import { sendError, mapDomainError } from './errorResponse.js';

/**
 * ProposalController: HTTP adapter for the governance (Pull-Request) flow.
 */
export class ProposalController {
  constructor(
    private readonly createProposal: CreateProposalUseCase,
    private readonly approveProposal: ApproveProposalUseCase,
    private readonly rejectProposal: RejectProposalUseCase,
    private readonly autoApplyProposal: AutoApplyProposalUseCase
  ) {}

  /** POST /api/v1/proposals */
  async create(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = CreateProposalSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const proposal = await this.createProposal.execute({
        ...parsed.data,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        proposerHash: ctx.authorHash,
        reqId: ctx.reqId,
      });

      return reply.status(201).send({
        id: proposal.id,
        targetId: proposal.targetId,
        targetType: proposal.targetType,
        status: proposal.status,
        communityScore: proposal.communityScore,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'createProposal failed');
    }
  }

  /** PUT /api/v1/proposals/:id/approve */
  async approve(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const proposalId = (req.params as { id: string }).id;
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const proposal = await this.approveProposal.execute({
        proposalId,
        resolverUserId: ctx.userId,
        resolverHash: ctx.authorHash,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        reqId: ctx.reqId,
      });

      return reply.status(200).send({ id: proposal.id, status: proposal.status });
    } catch (error) {
      return this.handleError(req, reply, error, 'approveProposal failed');
    }
  }

  /** PUT /api/v1/proposals/:id/reject */
  async reject(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const proposalId = (req.params as { id: string }).id;
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const proposal = await this.rejectProposal.execute({
        proposalId,
        resolverUserId: ctx.userId,
        resolverHash: ctx.authorHash,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        reqId: ctx.reqId,
      });

      return reply.status(200).send({ id: proposal.id, status: proposal.status });
    } catch (error) {
      return this.handleError(req, reply, error, 'rejectProposal failed');
    }
  }

  /** PUT /api/v1/proposals/:id/auto-apply */
  async autoApply(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const proposalId = (req.params as { id: string }).id;
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const proposal = await this.autoApplyProposal.execute({
        proposalId,
        resolverUserId: ctx.userId,
        resolverHash: ctx.authorHash,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        reqId: ctx.reqId,
      });

      return reply.status(200).send({ id: proposal.id, status: proposal.status });
    } catch (error) {
      return this.handleError(req, reply, error, 'autoApplyProposal failed');
    }
  }

  private handleError(
    req: FastifyRequest,
    reply: FastifyReply,
    error: unknown,
    op: string
  ): void {
    log.error(
      { err: error instanceof Error ? error.message : error, reqId: req.reqId },
      op
    );
    return sendError(reply, mapDomainError(error));
  }
}
