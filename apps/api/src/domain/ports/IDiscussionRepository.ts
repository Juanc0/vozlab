import { DiscussionThread } from '../entities/DiscussionThread.js';
import { DiscussionPost } from '../entities/DiscussionPost.js';

/**
 * Port: discussion threads + threaded comments persistence (RF-11, RF-16).
 * Scoped by `tid` (physical tenant DB).
 */
export interface IDiscussionRepository {
  findThreadById(id: string, tid: string): Promise<DiscussionThread | null>;
  findThreadsByTarget(
    targetId: string,
    targetType: string,
    tid: string
  ): Promise<DiscussionThread[]>;
  saveThread(thread: DiscussionThread, tid: string, tx?: any): Promise<void>;
  findPostsByThread(threadId: string, tid: string): Promise<DiscussionPost[]>;
  savePost(post: DiscussionPost, tid: string, tx?: any): Promise<void>;
  /** Adjusts a single post's denormalized counters (RF-15). */
  applyPostVote(postId: string, value: number, tid: string, tx?: any): Promise<void>;
}
