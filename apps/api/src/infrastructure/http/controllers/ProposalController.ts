import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateProposalSchema, ListProposalQuerySchema } from '@vozlab/shared-types';
import { CreateProposalUseCase } from '../../../application/use_cases/CreateProposalUseCase.js';
import { ApproveProposalUseCase } from '../../../application/use_cases/ApproveProposalUseCase.js';
import { RejectProposalUseCase } from '../../../application/use_cases/RejectProposalUseCase.js';
import { AutoApplyProposalUseCase } from '../../../application/use_cases/AutoApplyProposalUseCase.js';
import { ListProposalsUseCase } from '../../../application/use_cases/ListProposalsUseCase.js';
import { GetProposalUseCase } from '../../../application/use_cases/GetProposalUseCase.js';
import { EditProposal } from '../../../domain/entities/EditProposal.js';
import { log } from '../../../shared/logger/index.js';
import { getRequestContext } from './requestContext.js';
import { sendError, mapDomainError } from './errorResponse.js';

/**
 * Stable JSON projection of an EditProposal. Never leaks the raw entity
 * internals (e.g. the `AuthorHash` value object) — pseudonyms are emitted as
 * their 64-hex strings (NFR-07); `proposedChanges` is passed through as-is.
 */
interface ProposalDto {
  id: string;
  workspaceId: string;
  targetId: string;
  targetType: string;
  status: string;
  communityScore: number;
  justification: string | null;
  proposerHash: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  proposedChanges: Record<string, unknown>;
  createdAt: string;
}

function toProposalDto(proposal: EditProposal): ProposalDto {
  return {
    id: proposal.id,
    workspaceId: proposal.workspaceId,
    targetId: proposal.targetId,
    targetType: proposal.targetType,
    status: proposal.status,
    communityScore: proposal.communityScore,
    justification: proposal.justification,
    proposerHash: proposal.proposerHash.toString(),
    resolvedBy: proposal.resolvedBy?.toString() ?? null,
    resolvedAt: proposal.resolvedAt?.toISOString() ?? null,
    proposedChanges: proposal.proposedChanges,
    createdAt: proposal.createdAt.toISOString(),
  };
}

/**
 * ProposalController: HTTP adapter for the governance (Pull-Request) flow.
 */
export class ProposalController {
  constructor(
    private readonly createProposal: CreateProposalUseCase,
    private readonly approveProposal: ApproveProposalUseCase,
    private readonly rejectProposal: RejectProposalUseCase,
    private readonly autoApplyProposal: AutoApplyProposalUseCase,
    private readonly listProposals: ListProposalsUseCase,
    private readonly getProposal: GetProposalUseCase
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

  /**
   * GET /api/v1/proposals
   * Cursor-paginated listing of the workspace's proposals (NFR-04),
   * optionally filtered by `status`/`targetType`.
   */
  async list(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = ListProposalQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const { items, nextCursor } = await this.listProposals.execute({
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        limit: parsed.data.limit,
        cursor: parsed.data.cursor,
        status: parsed.data.status,
        targetType: parsed.data.targetType,
      });

      return reply.status(200).send({
        proposals: items.map(toProposalDto),
        nextCursor,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'listProposals failed');
    }
  }

  /**
   * GET /api/v1/proposals/:id
   * Returns the proposal, or 404 `ERR_PROPOSAL_NOT_FOUND` when it is missing
   * or belongs to another workspace.
   */
  async get(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const proposalId = (req.params as { id: string }).id;

    try {
      const proposal = await this.getProposal.execute({
        proposalId,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
      });
      return reply.status(200).send({ proposal: toProposalDto(proposal) });
    } catch (error) {
      return this.handleError(req, reply, error, 'getProposal failed');
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
