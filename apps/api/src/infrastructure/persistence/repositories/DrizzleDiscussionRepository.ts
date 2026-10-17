import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  discussionThreads,
  discussionPosts,
} from '@vozlab/database';
import {
  DiscussionThread,
  ThreadTargetType,
  ThreadStatus,
} from '../../../domain/entities/DiscussionThread.js';
import { DiscussionPost } from '../../../domain/entities/DiscussionPost.js';
import { DomainError } from '../../../domain/errors/DomainError.js';
import { AuthorHash } from '../../../domain/value_objects/AuthorHash.js';
import { IDiscussionRepository } from '../../../domain/ports/IDiscussionRepository.js';
import { ConnectionPoolManager } from '../ConnectionPoolManager.js';

/**
 * DrizzleDiscussionRepository: persists threads/posts to the tenant DB's
 * `social` schema. Scoped by `tid`.
 */
export class DrizzleDiscussionRepository implements IDiscussionRepository {
  constructor(private readonly poolManager: ConnectionPoolManager) {}

  private async client(tid: string, tx?: any) {
    return tx ?? (await this.poolManager.getDb(tid));
  }

  async findThreadById(id: string, tid: string): Promise<DiscussionThread | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select()
      .from(discussionThreads)
      .where(eq(discussionThreads.id, id))
      .limit(1);
    return row ? threadToDomain(row) : null;
  }

  /**
   * Keyset pagination over `(createdAt DESC, id DESC)`, mirroring
   * `DrizzleNodeRepository`/`DrizzleEdgeRepository`. The cursor is an opaque
   * base64 token encoding `"<iso>|<id>"`; a malformed token is a client error
   * (422) rather than a silent first page.
   */
  async listThreads(
    targetId: string,
    targetType: string,
    opts: { workspaceId: string; limit: number; cursor?: string },
    tid: string
  ): Promise<{ items: DiscussionThread[]; nextCursor: string | null }> {
    const db = await this.client(tid);

    const decoded = opts.cursor ? decodeCursor(opts.cursor) : null;
    if (opts.cursor && !decoded) {
      throw new DomainError('ERR_VALIDATION_FAILED', 'invalid pagination cursor');
    }

    const conditions = [
      eq(discussionThreads.workspaceId, opts.workspaceId),
      eq(discussionThreads.targetId, targetId),
      eq(discussionThreads.targetType, targetType),
    ];
    if (decoded) {
      // Tuple comparison mirrors the ORDER BY and stays index-friendly.
      conditions.push(
        sql`(${discussionThreads.createdAt}, ${discussionThreads.id}) < (${decoded.createdAt}, ${decoded.id})`
      );
    }

    // Fetch one extra row to detect whether a next page exists.
    const rows = await db
      .select()
      .from(discussionThreads)
      .where(and(...conditions))
      .orderBy(desc(discussionThreads.createdAt), desc(discussionThreads.id))
      .limit(opts.limit + 1);

    const hasNext = rows.length > opts.limit;
    const page = hasNext ? rows.slice(0, opts.limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map(threadToDomain),
      nextCursor: hasNext && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async saveThread(thread: DiscussionThread, tid: string, tx?: any): Promise<void> {
    const db = await this.client(tid, tx);
    await db.insert(discussionThreads).values({
      id: thread.id,
      workspaceId: thread.workspaceId,
      targetId: thread.targetId,
      targetType: thread.targetType,
      title: thread.title,
      status: thread.status,
      createdByHash: thread.createdByHash.toString(),
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    });
  }

  async updateThreadStatus(thread: DiscussionThread, tid: string, tx?: any): Promise<void> {
    const db = await this.client(tid, tx);
    await db
      .update(discussionThreads)
      .set({ status: thread.status, updatedAt: thread.updatedAt })
      .where(eq(discussionThreads.id, thread.id));
  }

  /**
   * Keyset pagination over `(createdAt ASC, id ASC)` so a thread reads
   * chronologically; the cursor encoding is shared with the thread listing.
   */
  async listPosts(
    threadId: string,
    opts: { limit: number; cursor?: string },
    tid: string
  ): Promise<{ items: DiscussionPost[]; nextCursor: string | null }> {
    const db = await this.client(tid);

    const decoded = opts.cursor ? decodeCursor(opts.cursor) : null;
    if (opts.cursor && !decoded) {
      throw new DomainError('ERR_VALIDATION_FAILED', 'invalid pagination cursor');
    }

    const conditions = [eq(discussionPosts.threadId, threadId)];
    if (decoded) {
      conditions.push(
        sql`(${discussionPosts.createdAt}, ${discussionPosts.id}) > (${decoded.createdAt}, ${decoded.id})`
      );
    }

    const rows = await db
      .select()
      .from(discussionPosts)
      .where(and(...conditions))
      .orderBy(asc(discussionPosts.createdAt), asc(discussionPosts.id))
      .limit(opts.limit + 1);

    const hasNext = rows.length > opts.limit;
    const page = hasNext ? rows.slice(0, opts.limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map(postToDomain),
      nextCursor: hasNext && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async savePost(post: DiscussionPost, tid: string, tx?: any): Promise<void> {
    const db = await this.client(tid, tx);
    await db.insert(discussionPosts).values({
      id: post.id,
      threadId: post.threadId,
      parentPostId: post.parentPostId,
      authorHash: post.authorHash.toString(),
      body: post.body,
      upvotes: post.upvotes,
      downvotes: post.downvotes,
      communityScore: post.communityScore,
      createdAt: post.createdAt,
      deletedAt: post.deletedAt,
    });
  }

  async applyPostVote(
    postId: string,
    value: number,
    tid: string,
    tx?: any
  ): Promise<void> {
    const db = await this.client(tid, tx);
    const up = value > 0 ? 1 : 0;
    const down = value < 0 ? 1 : 0;
    await db
      .update(discussionPosts)
      .set({
        upvotes: sql`${discussionPosts.upvotes} + ${up}`,
        downvotes: sql`${discussionPosts.downvotes} + ${down}`,
        communityScore: sql`${discussionPosts.communityScore} + ${up - down}`,
      })
      .where(eq(discussionPosts.id, postId));
  }
}

function threadToDomain(row: typeof discussionThreads.$inferSelect): DiscussionThread {
  return new DiscussionThread(
    row.id,
    row.workspaceId,
    row.targetId,
    row.targetType as ThreadTargetType,
    row.title,
    AuthorHash.fromString(row.createdByHash),
    row.status as ThreadStatus,
    row.createdAt,
    row.updatedAt
  );
}

function postToDomain(row: typeof discussionPosts.$inferSelect): DiscussionPost {
  return new DiscussionPost(
    row.id,
    row.threadId,
    row.parentPostId ?? null,
    AuthorHash.fromString(row.authorHash),
    row.body,
    row.upvotes,
    row.downvotes,
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
