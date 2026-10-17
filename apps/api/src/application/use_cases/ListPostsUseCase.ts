import { DiscussionPost } from '../../domain/entities/DiscussionPost.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IDiscussionRepository } from '../../domain/ports/IDiscussionRepository.js';

export type ListPostsInput = {
  threadId: string;
  tid: string;
  limit: number;
  cursor?: string;
};

export type ListPostsResult = {
  items: DiscussionPost[];
  nextCursor: string | null;
};

/**
 * Use Case: cursor-paginated, chronological listing of a thread's posts
 * (RF-16, NFR-04).
 *
 * Verifies the thread exists first so an unknown id yields
 * `ERR_THREAD_NOT_FOUND` (404) instead of an empty conversation.
 */
export class ListPostsUseCase {
  constructor(private readonly discussionRepo: IDiscussionRepository) {}

  async execute(input: ListPostsInput): Promise<ListPostsResult> {
    const thread = await this.discussionRepo.findThreadById(input.threadId, input.tid);
    if (!thread) {
      throw new DomainError('ERR_THREAD_NOT_FOUND');
    }

    return this.discussionRepo.listPosts(
      input.threadId,
      { limit: input.limit, cursor: input.cursor },
      input.tid
    );
  }
}
