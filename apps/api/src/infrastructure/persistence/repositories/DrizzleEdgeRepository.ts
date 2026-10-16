import { and, eq, isNull } from 'drizzle-orm';
import { edges } from '@vozlab/database';
import { Edge, EdgeStatus } from '../../../domain/entities/Edge.js';
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

  async softDelete(id: string, tid: string, tx?: any): Promise<void> {
    const db = await this.client(tid, tx);
    await db.update(edges).set({ deletedAt: new Date() }).where(eq(edges.id, id));
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
