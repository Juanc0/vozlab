import { and, asc, desc, eq, isNull } from 'drizzle-orm';
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
import { decodeCursor, encodeCursor, keysetAfter } from '../keyset.js';

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
      conditions.push(
        keysetAfter(discussionThreads.createdAt, discussionThreads.id, decoded, 'desc')
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

    const conditions = [eq(discussionPosts.threadId, threadId), isNull(discussionPosts.deletedAt)];
    if (decoded) {
      conditions.push(
        keysetAfter(discussionPosts.createdAt, discussionPosts.id, decoded, 'asc')
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

  /**
   * Load a single post, excluding soft-deleted rows (a deleted post is
   * reported as not-found, so delete clicks are idempotent).
   */
  async findPostById(id: string, tid: string): Promise<DiscussionPost | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select()
      .from(discussionPosts)
      .where(and(eq(discussionPosts.id, id), isNull(discussionPosts.deletedAt)))
      .limit(1);
    return row ? postToDomain(row) : null;
  }

  /**
   * Soft-delete a post by stamping `deletedAt`. The adapter is the single
   * writer of `deletedAt` (the use case never stamps it).
   */
  async softDeletePost(id: string, tid: string, tx?: any): Promise<void> {
    const db = await this.client(tid, tx);
    await db
      .update(discussionPosts)
      .set({ deletedAt: new Date() })
      .where(eq(discussionPosts.id, id));
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
