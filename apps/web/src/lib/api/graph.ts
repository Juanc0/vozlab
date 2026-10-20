/**
 * The graph reads: the newest nodes of a workspace and the **bounded**
 * subgraph around a root.
 *
 * The bounds are the API's, not ours: `SubgraphQuerySchema` accepts a depth
 * of 0 to 3 and at most 200 nodes. The canvas is a reader of that window —
 * it never pretends the graph is complete — so the clamps live here, next to
 * the call that would be rejected by a `422` otherwise.
 *
 * The module also owns the two **writes** of the graph: the creation of a
 * node (FR-06) and the creation of a relation (FR-08). Both are born
 * `PENDING`: the governance flow decides their fate.
 */

import { cursorQuery, type ApiClient, type CursorPage, type QueryValue } from './client';
import type {
  CreateEdgeInput,
  CreateNodeInput,
  NodeDto,
  NodeStatus,
  SubgraphEdgeDto,
  SubgraphResponseDto
} from './types';

/** The deepest traversal the API accepts. */
export const SUBGRAPH_MAX_DEPTH = 3;

/** The shallowest traversal the API accepts (the root alone). */
export const SUBGRAPH_MIN_DEPTH = 0;

/** The default depth of a subgraph. */
export const SUBGRAPH_DEFAULT_DEPTH = 1;

/** The largest number of nodes the API returns for one subgraph. */
export const SUBGRAPH_MAX_NODES = 200;

/** The smallest number of nodes the API returns for one subgraph. */
export const SUBGRAPH_MIN_NODES = 1;

/** The default number of nodes of a subgraph. */
export const SUBGRAPH_DEFAULT_NODES = 100;

/** The largest page of the node list (`ListNodeQuerySchema` caps `limit` at 100). */
export const NODE_LIST_MAX_LIMIT = 100;

/** The default page of the node list. */
export const NODE_LIST_DEFAULT_LIMIT = 20;

/**
 * Clamps a depth to the window the API accepts.
 *
 * A non-finite value falls back to the default rather than to `0`: a typo in
 * the control must not silently shrink the graph to its root.
 */
export function clampDepth(depth: number): number {
  if (!Number.isFinite(depth)) {
    return SUBGRAPH_DEFAULT_DEPTH;
  }
  return Math.min(SUBGRAPH_MAX_DEPTH, Math.max(SUBGRAPH_MIN_DEPTH, Math.trunc(depth)));
}

/** Clamps the node budget of a subgraph to the window the API accepts. */
export function clampSubgraphLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return SUBGRAPH_DEFAULT_NODES;
  }
  return Math.min(SUBGRAPH_MAX_NODES, Math.max(SUBGRAPH_MIN_NODES, Math.trunc(limit)));
}

/** Clamps the page size of the node list to the window the API accepts. */
export function clampNodeListLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return NODE_LIST_DEFAULT_LIMIT;
  }
  return Math.min(NODE_LIST_MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

/**
 * The query of `GET /api/v1/nodes/subgraph`.
 *
 * The depth and the limit are clamped here, so the request that leaves the
 * app is always one the API accepts.
 */
export function buildSubgraphQuery(
  rootId: string,
  depth: number,
  limit: number
): Record<string, QueryValue> {
  return {
    rootId,
    depth: clampDepth(depth),
    limit: clampSubgraphLimit(limit)
  };
}

/**
 * Reads the bounded subgraph around a root.
 *
 * A `404 ERR_NODE_NOT_FOUND` means the root is missing, soft-deleted or
 * belongs to another workspace — the API does not leak which of the three it
 * is, and neither does this app.
 */
export async function loadSubgraph(
  client: ApiClient,
  options: { rootId: string; depth: number; limit: number }
): Promise<SubgraphResponseDto> {
  const body = await client.request<SubgraphResponseDto>({
    path: '/nodes/subgraph',
    query: buildSubgraphQuery(options.rootId, options.depth, options.limit)
  });

  return {
    nodes: Array.isArray(body?.nodes) ? body.nodes : [],
    edges: Array.isArray(body?.edges) ? body.edges : []
  };
}

/**
 * Reads one page of the newest nodes of the workspace.
 *
 * The list is ordered `createdAt DESC, id DESC` and paginated with the
 * opaque keyset cursor.
 */
export async function listWorkspaceNodes(
  client: ApiClient,
  options: { limit?: number; cursor?: string | null } = {}
): Promise<CursorPage<NodeDto>> {
  const limit = clampNodeListLimit(options.limit ?? NODE_LIST_DEFAULT_LIMIT);

  return client.page<NodeDto>({
    path: '/nodes',
    resourceKey: 'nodes',
    query: cursorQuery(limit, options.cursor ?? null)
  });
}

/**
 * The answer of `POST /api/v1/nodes`.
 *
 * The route answers with a **projection** of the new node: the fields the
 * caller needs to show it. It is not the whole {@link NodeDto} — the
 * attributes, the author pseudonym and the timestamps are not in it — so the
 * caller reads the node back when it needs the full shape.
 */
export interface CreatedNode {
  readonly id: string;
  readonly workspaceId: string;
  readonly typeKey: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: NodeStatus;
}

/**
 * Creates a node (FR-06).
 *
 * The API checks the `typeKey` against the active ontology and stores the
 * `attributes` as they are: **the attributes are not validated by the
 * server**, so the form validates them before the request leaves the app.
 * The node is born `PENDING` — the governance flow decides its fate.
 */
export async function createNode(client: ApiClient, input: CreateNodeInput): Promise<CreatedNode> {
  const body = await client.request<CreatedNode>({
    method: 'POST',
    path: '/nodes',
    body: {
      typeKey: input.typeKey,
      title: input.title,
      description: input.description,
      attributes: input.attributes ?? {}
    }
  });

  return {
    id: body.id,
    workspaceId: body.workspaceId,
    typeKey: body.typeKey,
    title: body.title,
    description: body.description ?? null,
    status: body.status
  };
}

/** Reads one node by its id — the full {@link NodeDto}. */
export async function getNode(client: ApiClient, nodeId: string): Promise<NodeDto> {
  const body = await client.request<{ node: NodeDto }>({
    path: `/nodes/${encodeURIComponent(nodeId)}`
  });

  return body.node;
}

/**
 * Creates a directed edge between two existing nodes (FR-08).
 *
 * The answer is the topology of the relation — the same shape the subgraph
 * returns — so a created relation can be drawn without a second read.
 *
 * The API enforces the domain/range rule **only when the relation key
 * resolves to an active object property**; otherwise it answers `422
 * ERR_INVALID_RELATION_DOMAIN_RANGE`. The server stays authoritative: the
 * form only offers the relations it knows to be valid.
 */
export async function createEdge(
  client: ApiClient,
  input: CreateEdgeInput
): Promise<SubgraphEdgeDto> {
  const body = await client.request<SubgraphEdgeDto>({
    method: 'POST',
    path: '/edges',
    body: {
      sourceNodeId: input.sourceNodeId,
      targetNodeId: input.targetNodeId,
      relationKey: input.relationKey,
      attributes: input.attributes ?? {}
    }
  });

  return {
    id: body.id,
    sourceNodeId: body.sourceNodeId,
    targetNodeId: body.targetNodeId,
    relationKey: body.relationKey,
    status: body.status,
    communityScore: body.communityScore
  };
}
