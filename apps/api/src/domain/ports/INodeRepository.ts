import { Node } from '../entities/Node.js';

/**
 * A connecting edge in a subgraph projection. Deliberately narrow: the
 * view does not need edge attributes/author, only the topology.
 */
export interface SubgraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationKey: string;
  status: string;
}

export interface SubgraphResult {
  nodes: Node[];
  edges: SubgraphEdge[];
}

/**
 * Port: Node persistence contract.
 * Implementations live in infrastructure/ (e.g. DrizzleNodeRepository).
 *
 * Every method is scoped to a tenant (`tid`) to guarantee physical
 * multi-tenant isolation — the pool manager resolves a dedicated
 * connection per tenant.
 */
export interface INodeRepository {
  findById(id: string, tid: string): Promise<Node | null>;
  /**
   * List non-deleted nodes of a workspace using keyset (cursor) pagination
   * ordered by `createdAt DESC, id DESC` (NFR-04, O(1) — never OFFSET).
   *
   * `cursor` is an opaque token produced by the adapter and must be treated
   * as such by callers; the encode/decode lives in infrastructure.
   */
  listByWorkspace(
    workspaceId: string,
    opts: { limit: number; cursor?: string },
    tid: string
  ): Promise<{ items: Node[]; nextCursor: string | null }>;
  /**
   * Workspace-scoped subgraph (NFR-01): the root, its neighbours up to
   * `depth` undirected hops, and every edge whose both endpoints fall in the
   * covered node set. Soft-deleted nodes/edges are excluded and the node set
   * is bounded by `limit` (adapter caps depth at 3 and limit at 200).
   */
  getSubgraph(
    rootId: string,
    workspaceId: string,
    opts: { depth: number; limit: number },
    tid: string
  ): Promise<SubgraphResult>;
  save(node: Node, tid: string, tx?: any): Promise<void>;
  update(node: Node, tid: string, tx?: any): Promise<void>;
  applyDelta(
    targetId: string,
    proposedChanges: Record<string, any>,
    workspaceId: string,
    tid: string,
    tx?: any
  ): Promise<void>;
}