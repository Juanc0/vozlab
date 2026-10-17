import { and, eq, isNull } from 'drizzle-orm';
import { nodes } from '@vozlab/database';
import { Node, NodeStatus } from '../../../domain/entities/Node.js';
import { DomainError } from '../../../domain/errors/DomainError.js';
import { AuthorHash } from '../../../domain/value_objects/AuthorHash.js';
import { INodeRepository } from '../../../domain/ports/INodeRepository.js';
import { ConnectionPoolManager } from '../ConnectionPoolManager.js';

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
  private async client(tid: string, tx?: any) {
    return tx ?? (await this.poolManager.getDb(tid));
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

  async save(node: Node, tid: string, tx?: any): Promise<void> {
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

  async update(node: Node, tid: string, tx?: any): Promise<void> {
    const db = await this.client(tid, tx);
    await db
      .update(nodes)
      .set({
        title: node.title,
        description: node.description,
        attributes: node.attributes,
        status: node.status,
        communityScore: node.communityScore,
        updatedAt: new Date(),
      })
      .where(eq(nodes.id, node.id));
  }

  async applyDelta(
    targetId: string,
    proposedChanges: Record<string, any>,
    workspaceId: string,
    tid: string,
    tx?: any
  ): Promise<void> {
    const db = await this.client(tid, tx);

    const [existing] = await db
      .select()
      .from(nodes)
      .where(and(eq(nodes.id, targetId), eq(nodes.workspaceId, workspaceId)))
      .limit(1);

    if (!existing) {
      throw new DomainError('ERR_NODE_NOT_FOUND');
    }

    const existingAttributes = (existing.attributes as Record<string, any>) ?? {};

    await db
      .update(nodes)
      .set({
        title: proposedChanges.title ?? existing.title,
        description: proposedChanges.description ?? existing.description,
        attributes: { ...existingAttributes, ...(proposedChanges.attributes ?? {}) },
        updatedAt: new Date(),
      })
      .where(eq(nodes.id, targetId));
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
    row.updatedAt
  );
}
