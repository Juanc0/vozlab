import { AuthorHash } from '../value_objects/AuthorHash.js';

/**
 * DiscussionPost entity — a (possibly nested) comment inside a thread,
 * with per-comment voting (RF-16). Pure domain object.
 */
export class DiscussionPost {
  constructor(
    public readonly id: string,
    public readonly threadId: string,
    public readonly parentPostId: string | null,
    public readonly authorHash: AuthorHash,
    public body: string,
    public upvotes: number = 0,
    public downvotes: number = 0,
    public communityScore: number = 0,
    public readonly createdAt: Date = new Date(),
    /**
     * Read-only projection of the persisted soft-delete marker. `deleted_at`
     * is a pure persistence concern: the adapter is its single writer
     * (TASK-24/TASK-38) and no domain method stamps it.
     */
    public readonly deletedAt: Date | null = null
  ) {}

  /**
   * Apply a vote delta atomically to the denormalized counters (RF-15).
   * `value` > 0 = upvote, < 0 = downvote.
   */
  registerVote(value: number): void {
    if (value > 0) this.upvotes += 1;
    else if (value < 0) this.downvotes += 1;
    this.communityScore = this.upvotes - this.downvotes;
  }
}
