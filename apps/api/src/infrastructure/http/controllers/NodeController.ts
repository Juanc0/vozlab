import { FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateNodeSchema,
  ListNodeQuerySchema,
  NeighborsQuerySchema,
  SetNodeEmbeddingSchema,
  SubgraphQuerySchema,
  type NodeDto,
  type SubgraphResponseDto,
} from '@vozlab/shared-types';
import { CreateNodeUseCase } from '../../../application/use_cases/CreateNodeUseCase.js';
import { GetNodeUseCase } from '../../../application/use_cases/GetNodeUseCase.js';
import { GetNodeNeighborsUseCase } from '../../../application/use_cases/GetNodeNeighborsUseCase.js';
import { GetSubgraphUseCase } from '../../../application/use_cases/GetSubgraphUseCase.js';
import { ListNodesUseCase } from '../../../application/use_cases/ListNodesUseCase.js';
import { DeleteNodeUseCase } from '../../../application/use_cases/DeleteNodeUseCase.js';
import { SetNodeEmbeddingUseCase } from '../../../application/use_cases/SetNodeEmbeddingUseCase.js';
import { Node } from '../../../domain/entities/Node.js';
import { log } from '../../../shared/logger/index.js';
import { getRequestContext } from './requestContext.js';
import { sendError, mapDomainError } from './errorResponse.js';

/**
 * Stable JSON projection of a Node. Never leaks the raw entity internals
 * (e.g. the `AuthorHash` value object) — the hash is emitted as a string.
 *
 * The shape itself lives in `@vozlab/shared-types` (`NodeDto`) so the PWA
 * can type the responses it consumes.
 */
function toNodeDto(node: Node): NodeDto {
  return {
    id: node.id,
    workspaceId: node.workspaceId,
    typeKey: node.typeKey,
    title: node.title,
    description: node.description,
    attributes: node.attributes,
    authorHash: node.authorHash.toString(),
    status: node.status,
    communityScore: node.communityScore,
    createdAt: node.createdAt.toISOString(),
    updatedAt: node.updatedAt.toISOString(),
  };
}

/**
 * NodeController: HTTP adapter for node-related endpoints.
 * Translates HTTP requests into use-case invocations and maps domain
 * results/errors back to HTTP responses.
 */
export class NodeController {
  constructor(
    private readonly createNodeUseCase: CreateNodeUseCase,
    private readonly getNodeUseCase: GetNodeUseCase,
    private readonly getNodeNeighborsUseCase: GetNodeNeighborsUseCase,
    private readonly listNodesUseCase: ListNodesUseCase,
    private readonly getSubgraphUseCase: GetSubgraphUseCase,
    private readonly deleteNodeUseCase: DeleteNodeUseCase,
    private readonly setNodeEmbeddingUseCase: SetNodeEmbeddingUseCase
  ) {}

  /**
   * POST /api/v1/nodes
   * Creates a new node owned by the authenticated author within the
   * workspace resolved by TenantWorkspaceGuard (req.tid / req.workspaceId).
   */
  async createNode(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = CreateNodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const node = await this.createNodeUseCase.execute({
        ...parsed.data,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        authorHash: ctx.authorHash,
        reqId: ctx.reqId,
      });

      return reply.status(201).send({
        id: node.id,
        workspaceId: node.workspaceId,
        typeKey: node.typeKey,
        title: node.title,
        description: node.description,
        status: node.status,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'createNode failed');
    }
  }

  /**
   * GET /api/v1/nodes/:id
   * Returns the node, or 404 `ERR_NODE_NOT_FOUND` when it is missing or
   * belongs to another workspace.
   */
  async getNodeHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const nodeId = (req.params as { id: string }).id;

    try {
      const node = await this.getNodeUseCase.execute({
        nodeId,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
      });
      return reply.status(200).send({ node: toNodeDto(node) });
    } catch (error) {
      return this.handleError(req, reply, error, 'getNode failed');
    }
  }

  /**
   * GET /api/v1/nodes
   * Cursor-paginated listing of the workspace's nodes (NFR-04).
   */
  async listNodesHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = ListNodeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const { items, nextCursor } = await this.listNodesUseCase.execute({
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        limit: parsed.data.limit,
        cursor: parsed.data.cursor,
      });

      return reply.status(200).send({
        nodes: items.map(toNodeDto),
        nextCursor,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'listNodes failed');
    }
  }

  /**
   * GET /api/v1/nodes/subgraph
   * Bounded workspace subgraph around `rootId` (NFR-01): root + neighbours
   * up to `depth` hops and the edges connecting them. Unknown/foreign root
   * → 404 `ERR_NODE_NOT_FOUND`.
   */
  async getSubgraphHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = SubgraphQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const { nodes, edges } = await this.getSubgraphUseCase.execute({
        rootId: parsed.data.rootId,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        depth: parsed.data.depth,
        limit: parsed.data.limit,
      });

      return reply.status(200).send({
        nodes: nodes.map(toNodeDto),
        edges: edges.map((edge) => ({
          id: edge.id,
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          relationKey: edge.relationKey,
          status: edge.status,
        })),
      } satisfies SubgraphResponseDto);
    } catch (error) {
      return this.handleError(req, reply, error, 'getSubgraph failed');
    }
  }

  /**
   * DELETE /api/v1/nodes/:id
   * Soft-deletes the node (204). Only the author may delete; a non-author
   * gets 403 `ERR_AUTHORIZATION_FAILED`. A missing/foreign/already-deleted
   * node yields 404 `ERR_NODE_NOT_FOUND`.
   */
  async delete(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const nodeId = (req.params as { id: string }).id;

    try {
      await this.deleteNodeUseCase.execute({
        nodeId,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        authorHash: ctx.authorHash,
        reqId: ctx.reqId,
      });
      return reply.status(204).send();
    } catch (error) {
      return this.handleError(req, reply, error, 'deleteNode failed');
    }
  }

  /**
   * GET /api/v1/nodes/:id/neighbors
   * Vector search: the closest nodes of the workspace (FR-19, ADR-0022).
   *
   * 200 with the source node and its neighbours; 404 for a missing/foreign
   * node; 409 `ERR_NODE_NOT_EMBEDDED` when the node has no vector yet (the
   * Relator retries in that case).
   */
  async getNeighborsHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = NeighborsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const nodeId = (req.params as { id: string }).id;

    try {
      const result = await this.getNodeNeighborsUseCase.execute({
        nodeId,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        limit: parsed.data.limit,
      });

      return reply.status(200).send({
        node: result.source,
        neighbors: result.neighbors,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'getNodeNeighbors failed');
    }
  }

  /**
   * PUT /api/v1/nodes/:id/embedding
   * Agent-only embedding write-back (FR-18, ADR-0020). The route is guarded
   * by `requireAgentType('AGENT_EMBEDDER')`; this handler validates the
   * payload and delegates to the use case.
   *
   * 204 on success (idempotent overwrite), 422 for a malformed vector or an
   * unknown model, 404 for a missing/foreign/deleted node.
   */
  async setEmbedding(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = SetNodeEmbeddingSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const nodeId = (req.params as { id: string }).id;

    try {
      await this.setNodeEmbeddingUseCase.execute({
        nodeId,
        workspaceId: ctx.workspaceId,
        embedding: parsed.data.embedding,
        model: parsed.data.model,
        tid: ctx.tid,
      });
      return reply.status(204).send();
    } catch (error) {
      return this.handleError(req, reply, error, 'setNodeEmbedding failed');
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
