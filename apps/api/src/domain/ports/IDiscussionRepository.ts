import { DbTransaction } from './Transaction.js';
import { DiscussionThread } from '../entities/DiscussionThread.js';
import { DiscussionPost } from '../entities/DiscussionPost.js';

// Naming follows `modules_02 §6.8`.
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
  saveThread(thread: DiscussionThread, tid: string, tx?: DbTransaction): Promise<void>;
  /** Persist a thread's mutated state (status/updatedAt) after a transition. */
  update(thread: DiscussionThread, tid: string, tx?: DbTransaction): Promise<void>;
  /**
   * List a thread's posts using keyset (cursor) pagination ordered by
   * `createdAt ASC, id ASC` — chronological, for a stable conversation read
   * (NFR-04). Soft-deleted posts are excluded.
   */
  listPosts(
    threadId: string,
    opts: { limit: number; cursor?: string },
    tid: string
  ): Promise<{ items: DiscussionPost[]; nextCursor: string | null }>;
  /** Load a single non-deleted post; soft-deleted rows read as `null`. */
  findPostById(id: string, tid: string): Promise<DiscussionPost | null>;
  savePost(post: DiscussionPost, tid: string, tx?: DbTransaction): Promise<void>;
  /**
   * Soft-delete a post by stamping `deletedAt`. The adapter is the single
   * writer of `deletedAt`.
   */
  softDelete(id: string, tid: string, tx?: DbTransaction): Promise<void>;
}
