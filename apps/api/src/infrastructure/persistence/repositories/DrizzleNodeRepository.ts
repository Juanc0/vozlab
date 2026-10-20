import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { edges, nodes } from '@vozlab/database';
import { Node, NodeStatus } from '../../../domain/entities/Node.js';
import { EdgeStatus } from '../../../domain/entities/Edge.js';
import { DomainError } from '../../../domain/errors/DomainError.js';
import { AuthorHash } from '../../../domain/value_objects/AuthorHash.js';
import {
  INodeRepository,
  NearestNeighborsResult,
  NodeNeighbor,
  SubgraphResult,
} from '../../../domain/ports/INodeRepository.js';
import { ConnectionPoolManager } from '../ConnectionPoolManager.js';
import { decodeCursor, encodeCursor, keysetAfter } from '../keyset.js';
import { DbTransaction } from '../../../domain/ports/Transaction.js';

/** Concrete Drizzle transaction type resolved from the tenant pool client. */
type Tx = Parameters<
  Parameters<Awaited<ReturnType<ConnectionPoolManager['getDb']>>['transaction']>[0]
>[0];

/** NFR-01 hard bounds, enforced here so a pathological graph cannot blow up. */
const MAX_SUBGRAPH_DEPTH = 3;
const MAX_SUBGRAPH_NODES = 200;

/** ADR-0022: hard cap for the neighbour lookup (the use case clamps to 10). */
const MAX_NEIGHBORS = 10;

/**
 * DrizzleNodeRepository: adapter that persists Nodes to `public.nodes`
 * inside the tenant's physical database.
 *
 * Every operation is scoped by `tid`; when a `tx` (transaction) handle is
 * provided by the UnitOfWork it is reused so writes participate in the
 * caller's atomic boundary.
 */
export class DrizzleNodeRepository implements INodeRepository {
  constructor(private readonly poolManager: ConnectionPoolManager) {}

  /** Resolve the Drizzle client: the open transaction, or the tenant pool. */
  private async client(tid: string, tx?: DbTransaction) {
    return (tx as Tx | undefined) ?? (await this.poolManager.getDb(tid));
  }

  async findById(id: string, tid: string): Promise<Node | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select()
      .from(nodes)
      .where(and(eq(nodes.id, id), isNull(nodes.deletedAt)))
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findByIdInWorkspace(id: string, workspaceId: string, tid: string): Promise<Node | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select()
      .from(nodes)
      .where(and(eq(nodes.id, id), eq(nodes.workspaceId, workspaceId), isNull(nodes.deletedAt)))
      .limit(1);

    return row ? toDomain(row) : null;
  }

  /**
   * Keyset pagination over `(createdAt DESC, id DESC)`. The cursor is an
   * opaque base64 token that encodes `"<iso>|<id>"`; a malformed token is a
   * client error (`ERR_VALIDATION_FAILED`) rather than a silent first page.
   */
  async listByWorkspace(
    workspaceId: string,
    opts: { limit: number; cursor?: string },
    tid: string
  ): Promise<{ items: Node[]; nextCursor: string | null }> {
    const db = await this.client(tid);

    const decoded = opts.cursor ? decodeCursor(opts.cursor) : null;
    if (opts.cursor && !decoded) {
      throw new DomainError('ERR_VALIDATION_FAILED', 'invalid pagination cursor');
    }

    const conditions = [eq(nodes.workspaceId, workspaceId), isNull(nodes.deletedAt)];
    if (decoded) {
      conditions.push(keysetAfter(nodes.createdAt, nodes.id, decoded, 'desc'));
    }

    // Fetch one extra row to detect whether a next page exists.
    const rows = await db
      .select()
      .from(nodes)
      .where(and(...conditions))
      .orderBy(desc(nodes.createdAt), desc(nodes.id))
      .limit(opts.limit + 1);

    const hasNext = rows.length > opts.limit;
    const page = hasNext ? rows.slice(0, opts.limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map(toDomain),
      nextCursor: hasNext && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  /**
   * NFR-01 subgraph: iterative-BFS via a recursive CTE over `edges` (followed
   * in both directions, so "neighbour" is undirected), bounded by `depth` and
   * `limit`. The CTE yields ordered, de-duplicated node ids (shallowest first,
   * stable by id); nodes and the edges among them are then loaded through the
   * Drizzle query builder so the existing `toDomain` mapper is reused.
   */
  async getSubgraph(
    rootId: string,
    workspaceId: string,
    opts: { depth: number; limit: number },
    tid: string
  ): Promise<SubgraphResult> {
    const db = await this.client(tid);

    const depth = Math.min(Math.max(Math.trunc(opts.depth), 0), MAX_SUBGRAPH_DEPTH);
    const limit = Math.min(Math.max(Math.trunc(opts.limit), 1), MAX_SUBGRAPH_NODES);

    // NFR-01 bounds: `depth` terminates the walk and `limit` caps every step.
    // PostgreSQL allows exactly ONE recursive self-reference, only in the
    // right-hand operand of the top-level UNION (`parse_cte.c`), so the two
    // edge directions are enumerated inside a single LATERAL union rather than
    // two self-referencing branches. Each direction carries its own `LIMIT`
    // and the whole recursive step carries a `LIMIT`, so the working table
    // never exceeds `limit` rows per depth: with `depth <= 3` the traversal is
    // `O(limit · depth)` rows instead of unbounded fan-out. The outer `LIMIT`
    // is kept, and `UNION` (not UNION ALL) still de-duplicates (id, depth).
    const result = await db.execute(sql`
      WITH RECURSIVE reachable(id, depth) AS (
        SELECT n.id, 0
        FROM public.nodes n
        WHERE n.id = ${rootId}
          AND n.workspace_id = ${workspaceId}
          AND n.deleted_at IS NULL
        UNION
        (
          SELECT neighbor.id, r.depth + 1
          FROM reachable r
          JOIN LATERAL (
            (
              SELECT e.target_node_id AS id
              FROM public.edges e
              WHERE e.source_node_id = r.id
                AND e.workspace_id = ${workspaceId}
                AND e.deleted_at IS NULL
              LIMIT ${limit}
            )
            UNION
            (
              SELECT e.source_node_id AS id
              FROM public.edges e
              WHERE e.target_node_id = r.id
                AND e.workspace_id = ${workspaceId}
                AND e.deleted_at IS NULL
              LIMIT ${limit}
            )
          ) neighbor ON true
          JOIN public.nodes n
            ON n.id = neighbor.id
           AND n.workspace_id = ${workspaceId}
           AND n.deleted_at IS NULL
          WHERE r.depth < ${depth}
          LIMIT ${limit}
        )
      )
      SELECT id, MIN(depth)::int AS depth
      FROM reachable
      GROUP BY id
      ORDER BY depth ASC, id ASC
      LIMIT ${limit}
    `);

    const idRows = result.rows as { id: string; depth: number }[];

    if (idRows.length === 0) {
      return { nodes: [], edges: [] };
    }

    // Preserve the CTE ordering (shallowest first) after the unordered IN.
    const depthById = new Map(idRows.map((row) => [row.id, row.depth]));
    const ids = idRows.map((row) => row.id);

    const nodeRows = await db
      .select()
      .from(nodes)
      .where(and(inArray(nodes.id, ids), isNull(nodes.deletedAt)));

    const orderedNodes = nodeRows
      .map(toDomain)
      .sort(
        (a: Node, b: Node) =>
          (depthById.get(a.id) ?? 0) - (depthById.get(b.id) ?? 0) ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      );

    const edgeRows = await db
      .select({
        id: edges.id,
        sourceNodeId: edges.sourceNodeId,
        targetNodeId: edges.targetNodeId,
        relationKey: edges.relationKey,
        status: edges.status,
        communityScore: edges.communityScore,
      })
      .from(edges)
      .where(
        and(
          eq(edges.workspaceId, workspaceId),
          isNull(edges.deletedAt),
          inArray(edges.sourceNodeId, ids),
          inArray(edges.targetNodeId, ids)
        )
      );

    return {
      nodes: orderedNodes,
      edges: edgeRows.map((row) => ({
        id: row.id,
        sourceNodeId: row.sourceNodeId,
        targetNodeId: row.targetNodeId,
        relationKey: row.relationKey,
        // The column is text; the domain vocabulary is the edge status union
        // (the same mapping the edge repository does for a full edge).
        status: row.status as EdgeStatus,
        communityScore: row.communityScore,
      })),
    };
  }

  /**
   * FR-19 / ADR-0022: vector search for the Relator.
   *
   * The source node is loaded first so the caller can distinguish "no such
   * node" (`NOT_FOUND`) from "the node has no vector yet"
   * (`NOT_EMBEDDED`) — the second one is a retryable state, the first one is
   * a 404.
   *
   * The neighbour query is workspace-scoped and excludes soft-deleted rows,
   * rows without a vector and rows whose status is outside the allow-list
   * `('ACTIVE','PENDING')`, so a Relator can never be handed a rejected,
   * merged or deprecated node. The query vector is bound as a parameter, which
   * lets PostgreSQL use the HNSW index (`idx_nodes_embedding_hnsw`).
   */
  async findNearestInWorkspace(
    sourceId: string,
    workspaceId: string,
    opts: { limit: number },
    tid: string
  ): Promise<NearestNeighborsResult> {
    const db = await this.client(tid);
    const limit = Math.min(Math.max(Math.trunc(opts.limit), 1), MAX_NEIGHBORS);

    const sourceResult = await db.execute(sql`
      SELECT n.id::text AS id,
             n.type_key,
             n.title,
             n.description,
             n.status,
             n.embedding::text AS embedding
      FROM public.nodes n
      WHERE n.id = ${sourceId}
        AND n.workspace_id = ${workspaceId}
        AND n.deleted_at IS NULL
      LIMIT 1
    `);

    const source = sourceResult.rows[0] as
      | {
          id: string;
          type_key: string;
          title: string;
          description: string | null;
          status: string;
          embedding: string | null;
        }
      | undefined;

    if (!source) {
      return { status: 'NOT_FOUND' };
    }
    if (!source.embedding) {
      return { status: 'NOT_EMBEDDED' };
    }

    const neighborsResult = await db.execute(sql`
      SELECT n.id::text AS id,
             n.type_key,
             n.title,
             n.description,
             n.status,
             (1 - (n.embedding <=> ${source.embedding}::vector))::float8 AS similarity
      FROM public.nodes n
      WHERE n.workspace_id = ${workspaceId}
        AND n.id <> ${sourceId}
        AND n.embedding IS NOT NULL
        AND n.deleted_at IS NULL
        AND n.status IN ('ACTIVE', 'PENDING')
      ORDER BY n.embedding <=> ${source.embedding}::vector
      LIMIT ${limit}
    `);

    const neighbors: NodeNeighbor[] = neighborsResult.rows.map((row) => {
      const r = row as {
        id: string;
        type_key: string;
        title: string;
        description: string | null;
        status: string;
        similarity: number | string;
      };
      return {
        id: r.id,
        typeKey: r.type_key,
        title: r.title,
        description: r.description,
        status: r.status,
        similarity: Number(r.similarity),
      };
    });

    return {
      status: 'OK',
      source: {
        id: source.id,
        typeKey: source.type_key,
        title: source.title,
        description: source.description,
        status: source.status,
      },
      neighbors,
    };
  }

  async save(node: Node, tid: string, tx?: DbTransaction): Promise<void> {
    const db = await this.client(tid, tx);
    await db.insert(nodes).values({
      id: node.id,
      workspaceId: node.workspaceId,
      typeKey: node.typeKey,
      title: node.title,
      description: node.description,
      attributes: node.attributes,
      authorHash: node.authorHash.toString(),
      status: node.status,
      communityScore: node.communityScore,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    });
  }

  async update(node: Node, tid: string, tx?: DbTransaction): Promise<void> {
    const db = await this.client(tid, tx);
    await db
      .update(nodes)
      .set({
        title: node.title,
        description: node.description,
        attributes: node.attributes,
        status: node.status,
        communityScore: node.communityScore,
        // Timestamp ownership (TASK-38): the domain method that produced this
        // mutation is the single writer of `updatedAt`; the adapter only
        // persists the entity's value.
        updatedAt: node.updatedAt,
      })
      .where(eq(nodes.id, node.id));
  }

  /**
   * Soft-delete a node by stamping `deletedAt`. The adapter is the single
   * writer of `deletedAt` (the use case never stamps it).
   */
  async softDelete(id: string, tid: string, tx?: DbTransaction): Promise<void> {
    const db = await this.client(tid, tx);
    await db.update(nodes).set({ deletedAt: new Date() }).where(eq(nodes.id, id));
  }

  /**
   * FR-18 / ADR-0020: store the embedding vector, the model that produced it
   * and the write time.
   *
   * The predicate keeps the write inside the workspace and skips
   * soft-deleted rows, so a foreign or deleted node is reported as "not
   * updated" instead of being resurrected. The adapter is the single writer
   * of `embeddedAt`.
   */
  async setEmbedding(
    id: string,
    workspaceId: string,
    embedding: number[],
    model: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<boolean> {
    const db = await this.client(tid, tx);

    const updated = await db
      .update(nodes)
      .set({ embedding, embeddingModel: model, embeddedAt: new Date() })
      .where(
        and(
          eq(nodes.id, id),
          eq(nodes.workspaceId, workspaceId),
          isNull(nodes.deletedAt)
        )
      )
      .returning({ id: nodes.id });

    return updated.length > 0;
  }

  async applyDelta(
    targetId: string,
    proposedChanges: Record<string, any>,
    workspaceId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<void> {
    const db = await this.client(tid, tx);

    const [existing] = await db
      .select()
      .from(nodes)
      .where(
        and(
          eq(nodes.id, targetId),
          eq(nodes.workspaceId, workspaceId),
          isNull(nodes.deletedAt)
        )
      )
      .limit(1);

    if (!existing) {
      throw new DomainError('ERR_NODE_NOT_FOUND');
    }

    // Timestamp ownership (TASK-38): this projection has no caller-supplied
    // entity, but the row is already loaded — rebuild it, route the delta
    // through the domain method, and persist the entity's own `updatedAt`.
    // The write stays a single UPDATE statement.
    const node = toDomain(existing);
    node.title = proposedChanges.title ?? node.title;
    node.description = proposedChanges.description ?? node.description;
    node.updateAttributes((proposedChanges.attributes as Record<string, any>) ?? {});

    await db
      .update(nodes)
      .set({
        title: node.title,
        description: node.description,
        attributes: node.attributes,
        updatedAt: node.updatedAt,
      })
      .where(eq(nodes.id, targetId));
  }

  /**
   * ADR-0026: apply a merge.
   *
   * The duplicate becomes `MERGED` and points at the survivor; the survivor
   * adopts the attributes and the support of the duplicate. The write on the
   * duplicate is a compare-and-set on its status: a node that is no longer
   * mergeable (it was merged by another proposal in the meantime) is not
   * touched, and the caller gets `ERR_INVALID_STATE_TRANSITION`.
   */
  async mergeInto(
    source: Node,
    target: Node,
    tid: string,
    tx?: DbTransaction
  ): Promise<void> {
    const db = await this.client(tid, tx);

    const updated = await db
      .update(nodes)
      .set({
        status: source.status,
        mergedIntoId: source.mergedIntoId,
        updatedAt: source.updatedAt,
      })
      .where(
        and(
          eq(nodes.id, source.id),
          eq(nodes.workspaceId, source.workspaceId),
          inArray(nodes.status, ['PENDING', 'ACTIVE']),
          isNull(nodes.deletedAt)
        )
      )
      .returning({ id: nodes.id });

    if (updated.length === 0) {
      throw new DomainError(
        'ERR_INVALID_STATE_TRANSITION',
        'the node is no longer mergeable'
      );
    }

    await db
      .update(nodes)
      .set({
        attributes: target.attributes,
        communityScore: target.communityScore,
        updatedAt: target.updatedAt,
      })
      .where(eq(nodes.id, target.id));
  }
}

/**
 * Map a `public.nodes` row to the pure domain entity.
 */
function toDomain(row: typeof nodes.$inferSelect): Node {
  return new Node(
    row.id,
    row.workspaceId,
    row.typeKey,
    row.title,
    row.description ?? null,
    (row.attributes as Record<string, any>) ?? {},
    AuthorHash.fromString(row.authorHash),
    row.status as NodeStatus,
    row.communityScore,
    row.createdAt,
    row.updatedAt,
    row.mergedIntoId ?? null
  );
}
