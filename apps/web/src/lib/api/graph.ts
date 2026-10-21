/**
 * The graph reads: the newest nodes of a workspace and the **bounded**
 * subgraph around a root.
 *
 * The bounds are the API's, not ours: `SubgraphQuerySchema` accepts a depth
 * of 0 to 3 and at most 200 nodes. The canvas is a reader of that window —
 * it never pretends the graph is complete — so the clamps live here, next to
 * the call that would be rejected by a `422` otherwise.
 *
 * The module also owns the **writes** of the graph: the creation of a node
 * (FR-06), the creation of a relation (FR-08) and the direct edition of a
 * relation. The first two are born `PENDING`: the governance flow decides
 * their fate. The third one is the only write the API lets anybody do
 * directly — and only the **author** of the relation may do it.
 */

import { cursorQuery, type ApiClient, type CursorPage, type QueryValue } from './client';
import type {
  CreateEdgeInput,
  CreateNodeInput,
  EdgeDto,
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

/** The largest window the API returns for the exploration view. */
export const NODE_WINDOW_MAX_LIMIT = 200;

/** The default window of the exploration view. */
export const NODE_WINDOW_DEFAULT_LIMIT = 100;

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

/** Clamps the size of the exploration window to the one the API accepts. */
export function clampNodeWindowLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return NODE_WINDOW_DEFAULT_LIMIT;
  }
  return Math.min(NODE_WINDOW_MAX_LIMIT, Math.max(1, Math.trunc(limit)));
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
 * Reads the **exploration window** of the workspace.
 *
 * The window has no root: it is the most recent nodes of the workspace and
 * the relations among them. It is a **closed** graph — a relation whose
 * other endpoint is outside the window is not in the answer — and it has no
 * pagination: it is a landscape, not a list.
 *
 * The limit is clamped here, so the request that leaves the app is always
 * one the API accepts.
 */
export async function loadNodeWindow(
  client: ApiClient,
  options: { limit?: number } = {}
): Promise<SubgraphResponseDto> {
  const limit = clampNodeWindowLimit(options.limit ?? NODE_WINDOW_DEFAULT_LIMIT);

  const body = await client.request<SubgraphResponseDto>({
    path: '/nodes/window',
    query: { limit }
  });

  return {
    nodes: Array.isArray(body?.nodes) ? body.nodes : [],
    edges: Array.isArray(body?.edges) ? body.edges : []
  };
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
 * Reads one relation by its id — the full {@link EdgeDto}.
 *
 * The subgraph carries the **narrower** projection of a relation (the
 * topology, the key, the status and the score): it has no attributes. A
 * screen that shows the attributes of a relation — the correction form —
 * reads the relation itself.
 */
export async function getEdge(client: ApiClient, edgeId: string): Promise<EdgeDto> {
  const body = await client.request<{ edge: EdgeDto }>({
    path: `/edges/${encodeURIComponent(edgeId)}`
  });

  return body.edge;
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

/**
 * The body of a direct edition of a relation.
 *
 * The API takes `relationKey` and `attributes`, both optional: the edition
 * is partial. The attributes are **merged** into the ones of the relation
 * (`Edge.updateAttributes`), exactly as a proposal does — an attribute can
 * be changed and one can be added, but none can be removed nor renamed.
 */
export interface UpdateEdgeInput {
  /** The new key of the relation. */
  readonly relationKey?: string;
  /** The attributes to merge into the ones of the relation. */
  readonly attributes?: Record<string, unknown>;
}

/**
 * Edits a relation directly (the `PATCH /api/v1/edges/:id` route).
 *
 * **Only the author of the relation may do this**: the API compares the
 * caller's pseudonym with the one of the relation and answers `403
 * ERR_AUTHORIZATION_FAILED` otherwise. The UI only offers the action to the
 * author, but the API is the enforcement — and its refusal is shown.
 *
 * The answer is the whole relation: the caller adopts it instead of reading
 * it back.
 */
export async function updateEdge(
  client: ApiClient,
  edgeId: string,
  input: UpdateEdgeInput
): Promise<EdgeDto> {
  const body = await client.request<{ edge: EdgeDto }>({
    method: 'PATCH',
    path: `/edges/${encodeURIComponent(edgeId)}`,
    body: {
      ...(input.relationKey === undefined ? {} : { relationKey: input.relationKey }),
      ...(input.attributes === undefined ? {} : { attributes: input.attributes })
    }
  });

  return body.edge;
}
