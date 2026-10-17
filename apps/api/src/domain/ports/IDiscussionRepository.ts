import { DiscussionThread } from '../entities/DiscussionThread.js';
import { DiscussionPost } from '../entities/DiscussionPost.js';

/**
 * Port: discussion threads + threaded comments persistence (RF-11, RF-16).
 * Scoped by `tid` (physical tenant DB).
 */
export interface IDiscussionRepository {
  findThreadById(id: string, tid: string): Promise<DiscussionThread | null>;
  /**
   * List a workspace's threads attached to a target using keyset (cursor)
   * pagination ordered by `createdAt DESC, id DESC` (NFR-04, O(1) — never
   * OFFSET). `cursor` is an opaque token produced by the adapter and must be
   * treated as such by callers; the encode/decode lives in infrastructure.
   */
  listThreads(
    targetId: string,
    targetType: string,
    opts: { workspaceId: string; limit: number; cursor?: string },
    tid: string
  ): Promise<{ items: DiscussionThread[]; nextCursor: string | null }>;
  saveThread(thread: DiscussionThread, tid: string, tx?: any): Promise<void>;
  /** Persist a thread's mutated state (status/updatedAt) after a transition. */
  updateThreadStatus(thread: DiscussionThread, tid: string, tx?: any): Promise<void>;
  /**
   * List a thread's posts using keyset (cursor) pagination ordered by
   * `createdAt ASC, id ASC` — chronological, for a stable conversation read
   * (NFR-04).
   */
  listPosts(
    threadId: string,
    opts: { limit: number; cursor?: string },
    tid: string
  ): Promise<{ items: DiscussionPost[]; nextCursor: string | null }>;
  savePost(post: DiscussionPost, tid: string, tx?: any): Promise<void>;
  /** Adjusts a single post's denormalized counters (RF-15). */
  applyPostVote(postId: string, value: number, tid: string, tx?: any): Promise<void>;
}
