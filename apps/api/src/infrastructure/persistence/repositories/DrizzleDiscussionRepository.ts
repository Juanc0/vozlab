import { and, eq } from 'drizzle-orm';
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
import { AuthorHash } from '../../../domain/value_objects/AuthorHash.js';
import { IDiscussionRepository } from '../../../domain/ports/IDiscussionRepository.js';
import { ConnectionPoolManager } from '../ConnectionPoolManager.js';
import { sql } from 'drizzle-orm';

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

  async findThreadsByTarget(
    targetId: string,
    targetType: string,
    tid: string
  ): Promise<DiscussionThread[]> {
    const db = await this.client(tid);
    const rows = await db
      .select()
      .from(discussionThreads)
      .where(
        and(
          eq(discussionThreads.targetId, targetId),
          eq(discussionThreads.targetType, targetType)
        )
      );
    return rows.map(threadToDomain);
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

  async findPostsByThread(threadId: string, tid: string): Promise<DiscussionPost[]> {
    const db = await this.client(tid);
    const rows = await db
      .select()
      .from(discussionPosts)
      .where(eq(discussionPosts.threadId, threadId));
    return rows.map(postToDomain);
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
