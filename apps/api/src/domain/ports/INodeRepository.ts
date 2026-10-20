import { DbTransaction } from './Transaction.js';
import { Node } from '../entities/Node.js';
import { EdgeStatus } from '../entities/Edge.js';

/**
 * A connecting edge in a subgraph projection. Deliberately narrow: the
 * view does not need edge attributes/author, only the topology.
 */
export interface SubgraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationKey: string;
  status: EdgeStatus;
}

export interface SubgraphResult {
  nodes: Node[];
  edges: SubgraphEdge[];
}

/**
 * A candidate returned by the vector search (ADR-0022).
 */
export interface NodeNeighbor {
  id: string;
  typeKey: string;
  title: string;
  description: string | null;
  status: string;
  /** Cosine similarity in [0, 1]; 1 means identical direction. */
  similarity: number;
}

/**
 * Result of the neighbour lookup.
 *
 * The three states are explicit because they map to three different HTTP
 * answers: `NOT_FOUND` → 404, `NOT_EMBEDDED` → 409 (the vector is not ready
 * yet — the caller should retry), `OK` → 200.
 */
export type NearestNeighborsResult =
  | { status: 'NOT_FOUND' }
  | { status: 'NOT_EMBEDDED' }
  | {
      status: 'OK';
      source: {
        id: string;
        typeKey: string;
        title: string;
        description: string | null;
        status: string;
      };
      neighbors: NodeNeighbor[];
    };

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
  findByIdInWorkspace(id: string, workspaceId: string, tid: string): Promise<Node | null>;
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
  /**
   * Vector search: the closest nodes of the workspace to `sourceId`
   * (ADR-0022).
   *
   * The search is workspace-scoped and excludes soft-deleted rows, rows
   * without a vector and rows whose status is outside the allow-list
   * `('ACTIVE','PENDING')`. The source node is excluded.
   */
  findNearestInWorkspace(
    sourceId: string,
    workspaceId: string,
    opts: { limit: number },
    tid: string
  ): Promise<NearestNeighborsResult>;
  save(node: Node, tid: string, tx?: DbTransaction): Promise<void>;
  update(node: Node, tid: string, tx?: DbTransaction): Promise<void>;
  /**
   * Soft-delete a node by stamping `deletedAt`. The adapter is the single
   * writer of `deletedAt`; deleted nodes drop out of every read path
   * (`findById`, `listByWorkspace`, `getSubgraph`).
   */
  softDelete(id: string, tid: string, tx?: DbTransaction): Promise<void>;
  /**
   * Persist the embedding vector computed by the embedder worker
   * (FR-18, ADR-0020).
   *
   * The write is scoped to the workspace and to non-deleted rows: a node
   * that is missing, soft-deleted or owned by another workspace is NOT
   * updated and the adapter reports `false`, which the use case maps to
   * `404 ERR_NODE_NOT_FOUND` (ADR-0008 — existence is never leaked).
   *
   * The adapter is the single writer of `embeddedAt`; `embeddingModel` records
   * the model that produced the vector so a later model change is auditable.
   */
  setEmbedding(
    id: string,
    workspaceId: string,
    embedding: number[],
    model: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<boolean>;
  applyDelta(
    targetId: string,
    proposedChanges: Record<string, any>,
    workspaceId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<void>;
  /**
   * Apply a merge (ADR-0026): `source` becomes `MERGED` and points at
   * `target`, and `target` absorbs the attributes and the support of the
   * duplicate. The entities already carry the decision (the domain owns the
   * transition); the adapter persists it. Both writes happen in the caller's
   * transaction.
   */
  mergeInto(
    source: Node,
    target: Node,
    tid: string,
    tx?: DbTransaction
  ): Promise<void>;
}