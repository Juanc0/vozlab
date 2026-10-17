import { and, desc, eq, isNull, sql } from 'drizzle-orm';
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
      // Tuple comparison mirrors the ORDER BY and stays index-friendly.
      conditions.push(
        sql`(${nodes.createdAt}, ${nodes.id}) < (${decoded.createdAt}, ${decoded.id})`
      );
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
