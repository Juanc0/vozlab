import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateNodeSchema, ListNodeQuerySchema, SubgraphQuerySchema } from '@vozlab/shared-types';
import { CreateNodeUseCase } from '../../../application/use_cases/CreateNodeUseCase.js';
import { GetNodeUseCase } from '../../../application/use_cases/GetNodeUseCase.js';
import { GetSubgraphUseCase } from '../../../application/use_cases/GetSubgraphUseCase.js';
import { ListNodesUseCase } from '../../../application/use_cases/ListNodesUseCase.js';
import { Node } from '../../../domain/entities/Node.js';
import { log } from '../../../shared/logger/index.js';
import { getRequestContext } from './requestContext.js';
import { sendError, mapDomainError } from './errorResponse.js';

/**
 * Stable JSON projection of a Node. Never leaks the raw entity internals
 * (e.g. the `AuthorHash` value object) — the hash is emitted as a string.
 */
interface NodeDto {
  id: string;
  workspaceId: string;
  typeKey: string;
  title: string;
  description: string | null;
  attributes: Record<string, unknown>;
  authorHash: string;
  status: string;
  communityScore: number;
  createdAt: string;
  updatedAt: string;
}

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
    private readonly listNodesUseCase: ListNodesUseCase,
    private readonly getSubgraphUseCase: GetSubgraphUseCase
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
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'getSubgraph failed');
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
