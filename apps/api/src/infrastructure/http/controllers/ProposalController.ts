import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateProposalSchema, ERROR_CODES, buildError } from '@vozlab/shared-types';
import { CreateProposalUseCase } from '../../../application/use_cases/CreateProposalUseCase.js';
import { ApproveProposalUseCase } from '../../../application/use_cases/ApproveProposalUseCase.js';
import { RejectProposalUseCase } from '../../../application/use_cases/RejectProposalUseCase.js';
import { log } from '../../../shared/logger/index.js';

type ErrorCode = keyof typeof ERROR_CODES;

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
      return this.fail(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = this.context(req);
    if (!ctx) return this.fail(reply, 'ERR_MISSING_WORKSPACE_HEADER');

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
      return this.handleError(req, reply, error);
    }
  }

  /** PUT /api/v1/proposals/:id/approve */
  async approve(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const proposalId = (req.params as { id: string }).id;
    const ctx = this.context(req);
    if (!ctx) return this.fail(reply, 'ERR_MISSING_WORKSPACE_HEADER');

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
      return this.handleError(req, reply, error);
    }
  }

  /** PUT /api/v1/proposals/:id/reject */
  async reject(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const proposalId = (req.params as { id: string }).id;
    const ctx = this.context(req);
    if (!ctx) return this.fail(reply, 'ERR_MISSING_WORKSPACE_HEADER');

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
      return this.handleError(req, reply, error);
    }
  }

  /** Extract the zero-trust request context attached by the guards. */
  private context(req: FastifyRequest) {
    const workspaceId = req.workspaceId;
    const tid = req.tid;
    if (!workspaceId || !tid) return null;
    return {
      workspaceId,
      tid,
      authorHash: req.user?.authorHash ?? 'anonymous',
      reqId: req.reqId,
    };
  }

  private fail(
    reply: FastifyReply,
    code: ErrorCode,
    extra?: Record<string, unknown>
  ): void {
    const err = buildError(code);
    reply.status(err.status).send({ code: err.code, message: err.message, ...extra });
  }

  private handleError(req: FastifyRequest, reply: FastifyReply, error: unknown): void {
    const message = error instanceof Error ? error.message : 'unknown error';

    if (message.includes('ERR_PROPOSAL_NOT_FOUND')) {
      return this.fail(reply, 'ERR_PROPOSAL_NOT_FOUND');
    }
    if (message.includes('ERR_INVALID_STATE_TRANSITION')) {
      return this.fail(reply, 'ERR_INVALID_STATE_TRANSITION');
    }
    if (message.includes('ERR_NODE_NOT_FOUND')) {
      return this.fail(reply, 'ERR_NODE_NOT_FOUND');
    }

    log.error({ err: message, reqId: req.reqId }, 'proposal operation failed');
    return this.fail(reply, 'ERR_INTERNAL_SERVER_ERROR');
  }
}
