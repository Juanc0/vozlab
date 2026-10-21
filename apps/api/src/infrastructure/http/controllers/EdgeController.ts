import { FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateEdgeSchema,
  UpdateEdgeSchema,
  ListNodeQuerySchema,
  type EdgeDto,
} from '@vozlab/shared-types';
import { CreateEdgeUseCase } from '../../../application/use_cases/CreateEdgeUseCase.js';
import { GetEdgeUseCase } from '../../../application/use_cases/GetEdgeUseCase.js';
import { ListEdgesUseCase } from '../../../application/use_cases/ListEdgesUseCase.js';
import { UpdateEdgeUseCase } from '../../../application/use_cases/UpdateEdgeUseCase.js';
import { DeleteEdgeUseCase } from '../../../application/use_cases/DeleteEdgeUseCase.js';
import type { DisplayNames } from '../../../application/use_cases/DisplayNameCatalog.js';
import type { Edge } from '../../../domain/entities/Edge.js';
import { log } from '../../../shared/logger/index.js';
import { getRequestContext } from './requestContext.js';
import { sendError, mapDomainError } from './errorResponse.js';

/**
 * Stable JSON projection of an Edge. Never leaks the raw entity internals
 * (e.g. the `AuthorHash` value object) — the hash is emitted as a string.
 *
 * The shape itself lives in `@vozlab/shared-types` (`EdgeDto`) so the PWA
 * can type the responses it consumes.
 *
 * The edge carries the **display names** of its relation: the API does not
 * negotiate the language, it sends the whole map and the client picks the
 * name of its language. A relation that is not in the ontology carries an
 * empty map and the client falls back to the key.
 */
function toEdgeDto(edge: Edge, relationDisplayNames: DisplayNames): EdgeDto {
  return {
    id: edge.id,
    workspaceId: edge.workspaceId,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    relationKey: edge.relationKey,
    relationDisplayNames,
    attributes: edge.attributes,
    authorHash: edge.authorHash.toString(),
    status: edge.status,
    communityScore: edge.communityScore,
    createdAt: edge.createdAt.toISOString(),
  };
}

/**
 * EdgeController: HTTP adapter for directed relations between nodes (RF-08).
 * Translates HTTP requests into use-case invocations and maps domain
 * results/errors back to HTTP responses.
 */
export class EdgeController {
  constructor(
    private readonly createEdgeUseCase: CreateEdgeUseCase,
    private readonly getEdgeUseCase: GetEdgeUseCase,
    private readonly listEdgesUseCase: ListEdgesUseCase,
    private readonly updateEdgeUseCase: UpdateEdgeUseCase,
    private readonly deleteEdgeUseCase: DeleteEdgeUseCase
  ) {}

  /** POST /api/v1/edges */
  async create(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = CreateEdgeSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const { edge, relationDisplayNames } = await this.createEdgeUseCase.execute({
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
        relationDisplayNames,
        status: edge.status,
        // A new relation starts at zero, but the field belongs to the shape:
        // the receipt of the creation and the relation of the graph speak
        // about the same relation.
        communityScore: edge.communityScore,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'createEdge failed');
    }
  }

  /**
   * GET /api/v1/edges/:id
   * Returns the edge, or 404 `ERR_EDGE_NOT_FOUND` when it is missing or
   * belongs to another workspace.
   */
  async get(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const edgeId = (req.params as { id: string }).id;

    try {
      const { edge, relationDisplayNames } = await this.getEdgeUseCase.execute({
        edgeId,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
      });
      return reply.status(200).send({ edge: toEdgeDto(edge, relationDisplayNames) });
    } catch (error) {
      return this.handleError(req, reply, error, 'getEdge failed');
    }
  }

  /**
   * GET /api/v1/edges
   * Cursor-paginated listing of the workspace's edges (NFR-04).
   */
  async list(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = ListNodeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const { items, nextCursor } = await this.listEdgesUseCase.execute({
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        limit: parsed.data.limit,
        cursor: parsed.data.cursor,
      });

      return reply.status(200).send({
        edges: items.map((named) => toEdgeDto(named.edge, named.relationDisplayNames)),
        nextCursor,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'listEdges failed');
    }
  }

  /**
   * PATCH /api/v1/edges/:id
   * Partial update of `relationKey` / `attributes`. Only the author may
   * update; a non-author gets 403 `ERR_AUTHORIZATION_FAILED`.
   */
  async update(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = UpdateEdgeSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const edgeId = (req.params as { id: string }).id;

    try {
      const { edge, relationDisplayNames } = await this.updateEdgeUseCase.execute({
        ...parsed.data,
        edgeId,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        authorHash: ctx.authorHash,
        reqId: ctx.reqId,
      });
      return reply.status(200).send({ edge: toEdgeDto(edge, relationDisplayNames) });
    } catch (error) {
      return this.handleError(req, reply, error, 'updateEdge failed');
    }
  }

  /**
   * DELETE /api/v1/edges/:id
   * Soft-deletes the edge (204). Only the author may delete; a non-author
   * gets 403 `ERR_AUTHORIZATION_FAILED`.
   */
  async delete(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const edgeId = (req.params as { id: string }).id;

    try {
      await this.deleteEdgeUseCase.execute({
        edgeId,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        authorHash: ctx.authorHash,
        reqId: ctx.reqId,
      });
      return reply.status(204).send();
    } catch (error) {
      return this.handleError(req, reply, error, 'deleteEdge failed');
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
