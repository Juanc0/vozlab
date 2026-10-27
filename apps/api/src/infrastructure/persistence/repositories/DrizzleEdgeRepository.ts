import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { edges } from '@vozlab/database';
import { Edge, EdgeStatus } from '../../../domain/entities/Edge.js';
import { DomainError } from '../../../domain/errors/DomainError.js';
import { AuthorHash } from '../../../domain/value_objects/AuthorHash.js';
import { IEdgeRepository } from '../../../domain/ports/IEdgeRepository.js';
import { ConnectionPoolManager } from '../ConnectionPoolManager.js';
import { DbTransaction } from '../../../domain/ports/Transaction.js';

/** Concrete Drizzle transaction type resolved from the tenant pool client. */
type Tx = Parameters<
  Parameters<Awaited<ReturnType<ConnectionPoolManager['getDb']>>['transaction']>[0]
>[0];
import { decodeCursor, encodeCursor, keysetAfter } from '../keyset.js';

/**
 * DrizzleEdgeRepository: persists Edges to `public.edges` in the tenant DB.
 * Scoped by `tid`; reuses the UnitOfWork transaction (`tx`) when provided.
 */
export class DrizzleEdgeRepository implements IEdgeRepository {
  constructor(private readonly poolManager: ConnectionPoolManager) {}

  private async client(tid: string, tx?: DbTransaction) {
    return (tx as Tx | undefined) ?? (await this.poolManager.getDb(tid));
  }

  async findById(id: string, tid: string): Promise<Edge | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select()
      .from(edges)
      .where(and(eq(edges.id, id), isNull(edges.deletedAt)))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByIdInWorkspace(id: string, workspaceId: string, tid: string): Promise<Edge | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select()
      .from(edges)
      .where(and(eq(edges.id, id), eq(edges.workspaceId, workspaceId), isNull(edges.deletedAt)))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async listAllByWorkspace(workspaceId: string, tid: string): Promise<Edge[]> {
    const db = await this.client(tid);
    const rows = await db
      .select()
      .from(edges)
      .where(and(eq(edges.workspaceId, workspaceId), isNull(edges.deletedAt)));
    return rows.map(toDomain);
  }

  /**
   * Keyset pagination over `(createdAt DESC, id DESC)`, mirroring
   * `DrizzleNodeRepository`. The cursor is an opaque base64 token encoding
   * `"<iso>|<id>"`; a malformed token is a client error (422) rather than a
   * silent first page.
   */
  async listByWorkspace(
    workspaceId: string,
    opts: { limit: number; cursor?: string },
    tid: string
  ): Promise<{ items: Edge[]; nextCursor: string | null }> {
    const db = await this.client(tid);

    const decoded = opts.cursor ? decodeCursor(opts.cursor) : null;
    if (opts.cursor && !decoded) {
      throw new DomainError('ERR_VALIDATION_FAILED', 'invalid pagination cursor');
    }

    const conditions = [eq(edges.workspaceId, workspaceId), isNull(edges.deletedAt)];
    if (decoded) {
      conditions.push(keysetAfter(edges.createdAt, edges.id, decoded, 'desc'));
    }

    // Fetch one extra row to detect whether a next page exists.
    const rows = await db
      .select()
      .from(edges)
      .where(and(...conditions))
      .orderBy(desc(edges.createdAt), desc(edges.id))
      .limit(opts.limit + 1);

    const hasNext = rows.length > opts.limit;
    const page = hasNext ? rows.slice(0, opts.limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map(toDomain),
      nextCursor: hasNext && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async save(edge: Edge, tid: string, tx?: DbTransaction): Promise<void> {
    const db = await this.client(tid, tx);
    await db.insert(edges).values({
      id: edge.id,
      workspaceId: edge.workspaceId,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      relationKey: edge.relationKey,
      attributes: edge.attributes,
      authorHash: edge.authorHash.toString(),
      status: edge.status,
      communityScore: edge.communityScore,
      createdAt: edge.createdAt,
      deletedAt: edge.deletedAt,
    });
  }

  async update(edge: Edge, tid: string, tx?: DbTransaction): Promise<void> {
    const db = await this.client(tid, tx);
    await db
      .update(edges)
      .set({
        relationKey: edge.relationKey,
        attributes: edge.attributes,
        status: edge.status,
        communityScore: edge.communityScore,
      })
      .where(eq(edges.id, edge.id));
  }

  async softDelete(id: string, tid: string, tx?: DbTransaction): Promise<void> {
    const db = await this.client(tid, tx);
    await db.update(edges).set({ deletedAt: new Date() }).where(eq(edges.id, id));
  }

  async applyDelta(
    targetId: string,
    proposedChanges: Record<string, unknown>,
    workspaceId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<void> {
    const db = await this.client(tid, tx);
    const [existing] = await db
      .select()
      .from(edges)
      .where(
        and(
          eq(edges.id, targetId),
          eq(edges.workspaceId, workspaceId),
          isNull(edges.deletedAt)
        )
      )
      .limit(1);

    if (!existing) {
      throw new DomainError('ERR_EDGE_NOT_FOUND');
    }

    const existingAttributes = (existing.attributes as Record<string, unknown>) ?? {};
    const attributesDelta = (proposedChanges.attributes as Record<string, unknown>) ?? {};

    // Whitelist accepted keys; never spread unknown jsonb keys into the update.
    const patch: Record<string, unknown> = {
      attributes: { ...existingAttributes, ...attributesDelta },
    };
    if (typeof proposedChanges.relationKey === 'string') {
      patch.relationKey = proposedChanges.relationKey;
    }

    await db.update(edges).set(patch).where(eq(edges.id, targetId));
  }

  /**
   * ADR-0026: re-point the edges of a merged node to the node that survives.
   *
   * Three statements, in this order:
   *
   *   1. the edges between the merged node and itself or the survivor are
   *      soft-deleted — they would become self-loops of the survivor;
   *   2. the edges that would duplicate an existing edge of the survivor
   *      (same relation key, same other end) are soft-deleted instead of
   *      re-pointed;
   *   3. the remaining edges are re-pointed: the merged node's end becomes the
   *      survivor's end.
   *
   * The adapter is the single writer of `deleted_at` (ADR-0011).
   */
  async repointEdges(
    nodeId: string,
    replacementId: string,
    workspaceId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<void> {
    const db = await this.client(tid, tx);

    await db.execute(sql`
      UPDATE public.edges
      SET deleted_at = now()
      WHERE workspace_id = ${workspaceId}
        AND deleted_at IS NULL
        AND (
          (source_node_id = ${nodeId} AND target_node_id = ${nodeId})
          OR (source_node_id = ${nodeId} AND target_node_id = ${replacementId})
          OR (target_node_id = ${nodeId} AND source_node_id = ${replacementId})
        )
    `);

    await db.execute(sql`
      UPDATE public.edges e
      SET deleted_at = now()
      WHERE e.workspace_id = ${workspaceId}
        AND e.deleted_at IS NULL
        AND (e.source_node_id = ${nodeId} OR e.target_node_id = ${nodeId})
        AND EXISTS (
          SELECT 1
          FROM public.edges d
          WHERE d.workspace_id = e.workspace_id
            AND d.deleted_at IS NULL
            AND d.id <> e.id
            AND d.relation_key = e.relation_key
            AND (
              (
                e.source_node_id = ${nodeId}
                AND d.source_node_id = ${replacementId}
                AND d.target_node_id = e.target_node_id
              )
              OR (
                e.target_node_id = ${nodeId}
                AND d.target_node_id = ${replacementId}
                AND d.source_node_id = e.source_node_id
              )
            )
        )
    `);

    await db.execute(sql`
      UPDATE public.edges
      SET source_node_id = ${replacementId}
      WHERE workspace_id = ${workspaceId}
        AND deleted_at IS NULL
        AND source_node_id = ${nodeId}
    `);

    await db.execute(sql`
      UPDATE public.edges
      SET target_node_id = ${replacementId}
      WHERE workspace_id = ${workspaceId}
        AND deleted_at IS NULL
        AND target_node_id = ${nodeId}
    `);
  }
}

function toDomain(row: typeof edges.$inferSelect): Edge {
  return new Edge(
    row.id,
    row.workspaceId,
    row.sourceNodeId,
    row.targetNodeId,
    row.relationKey,
    (row.attributes as Record<string, unknown>) ?? {},
    AuthorHash.fromString(row.authorHash),
    row.status as EdgeStatus,
    row.communityScore,
    row.createdAt,
    row.deletedAt ?? null
  );
}
