import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateProposalSchema } from '@vozlab/shared-types';
import { CreateProposalUseCase } from '../../../application/use_cases/CreateProposalUseCase.js';
import { ApproveProposalUseCase } from '../../../application/use_cases/ApproveProposalUseCase.js';
import { RejectProposalUseCase } from '../../../application/use_cases/RejectProposalUseCase.js';
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
    private readonly rejectProposal: RejectProposalUseCase
  ) {}

  /** POST /api/v1/proposals */
  async create(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = CreateProposalSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_MISSING_WORKSPACE_HEADER');

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
    if (!ctx) return sendError(reply, 'ERR_MISSING_WORKSPACE_HEADER');

    try {
      const proposal = await this.approveProposal.execute({
        proposalId,
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
    if (!ctx) return sendError(reply, 'ERR_MISSING_WORKSPACE_HEADER');

    try {
      const proposal = await this.rejectProposal.execute({
        proposalId,
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
