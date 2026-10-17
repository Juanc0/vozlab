import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { edges } from '@vozlab/database';
import { Edge, EdgeStatus } from '../../../domain/entities/Edge.js';
import { DomainError } from '../../../domain/errors/DomainError.js';
import { AuthorHash } from '../../../domain/value_objects/AuthorHash.js';
import { IEdgeRepository } from '../../../domain/ports/IEdgeRepository.js';
import { ConnectionPoolManager } from '../ConnectionPoolManager.js';

/**
 * DrizzleEdgeRepository: persists Edges to `public.edges` in the tenant DB.
 * Scoped by `tid`; reuses the UnitOfWork transaction (`tx`) when provided.
 */
export class DrizzleEdgeRepository implements IEdgeRepository {
  constructor(private readonly poolManager: ConnectionPoolManager) {}

  private async client(tid: string, tx?: any) {
    return tx ?? (await this.poolManager.getDb(tid));
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

  async findByWorkspace(workspaceId: string, tid: string): Promise<Edge[]> {
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
      // Tuple comparison mirrors the ORDER BY and stays index-friendly.
      conditions.push(
        sql`(${edges.createdAt}, ${edges.id}) < (${decoded.createdAt}, ${decoded.id})`
      );
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

  async save(edge: Edge, tid: string, tx?: any): Promise<void> {
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

  async update(edge: Edge, tid: string, tx?: any): Promise<void> {
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

  async softDelete(id: string, tid: string, tx?: any): Promise<void> {
    const db = await this.client(tid, tx);
    await db.update(edges).set({ deletedAt: new Date() }).where(eq(edges.id, id));
  }

  async applyDelta(
    targetId: string,
    proposedChanges: Record<string, unknown>,
    workspaceId: string,
    tid: string,
    tx?: any
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

    const existingAttributes = (existing.attributes as Record<string, any>) ?? {};
    const attributesDelta = (proposedChanges.attributes as Record<string, any>) ?? {};

    // Whitelist accepted keys; never spread unknown jsonb keys into the update.
    const patch: Record<string, any> = {
      attributes: { ...existingAttributes, ...attributesDelta },
    };
    if (typeof proposedChanges.relationKey === 'string') {
      patch.relationKey = proposedChanges.relationKey;
    }

    await db.update(edges).set(patch).where(eq(edges.id, targetId));
  }
}

function toDomain(row: typeof edges.$inferSelect): Edge {
  return new Edge(
    row.id,
    row.workspaceId,
    row.sourceNodeId,
    row.targetNodeId,
    row.relationKey,
    (row.attributes as Record<string, any>) ?? {},
    AuthorHash.fromString(row.authorHash),
    row.status as EdgeStatus,
    row.communityScore,
    row.createdAt,
    row.deletedAt ?? null
  );
}

/** Opaque cursor encoding: base64("<createdAt ISO>|<id>"). */
function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64');
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  const raw = Buffer.from(cursor, 'base64').toString('utf8');
  const separator = raw.lastIndexOf('|');
  if (separator <= 0) return null;

  const createdAt = new Date(raw.slice(0, separator));
  const id = raw.slice(separator + 1);
  if (Number.isNaN(createdAt.getTime()) || !id) return null;

  return { createdAt, id };
}
