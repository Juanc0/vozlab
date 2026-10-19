import { DomainError } from '../../domain/errors/DomainError.js';
import { IDiscussionRepository } from '../../domain/ports/IDiscussionRepository.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type DeletePostInput = {
  postId: string;
  workspaceId: string;
  tid: string;
  authorHash: string;
  reqId?: string;
  /**
   * Optional when the route does not carry the thread (e.g. the flat
   * `DELETE /discussions/posts/:id` endpoint): it is then derived from the
   * loaded post. Nested routes may pass it explicitly so the workspace check
   * runs before the post lookup.
   */
  threadId?: string;
};

/**
 * Use Case: soft-delete a discussion post (governance keeps history).
 *
 * The post's thread is resolved first so workspace isolation (FR-05) is
 * enforced: a post/thread outside the caller's workspace is reported as
 * not-found (never 403) so its existence is not leaked. Only the post author
 * may delete it; the row is never hard-deleted, only stamped with `deletedAt`
 * by the repository (single writer, TASK-24). A deleted post reads as
 * not-found, so a second click is idempotent from the client's perspective.
 * The event is published post-commit and best-effort.
 */
export class DeletePostUseCase {
  constructor(
    private readonly discussionRepo: IDiscussionRepository,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: DeletePostInput): Promise<void> {
    const post = await this.discussionRepo.findPostById(input.postId, input.tid);
    if (!post) {
      throw new DomainError('ERR_POST_NOT_FOUND');
    }

    // Resolve the thread from the explicit input when present, otherwise from
    // the post itself (the flat route has no thread in its path).
    const threadId = input.threadId ?? post.threadId;

    const thread = await this.discussionRepo.findThreadById(threadId, input.tid);
    if (!thread) {
      throw new DomainError('ERR_THREAD_NOT_FOUND');
    }

    // Workspace isolation (FR-05): a thread in another workspace is reported
    // as not-found (never 403) so its existence is not leaked.
    if (thread.workspaceId !== input.workspaceId) {
      throw new DomainError('ERR_THREAD_NOT_FOUND');
    }

    // The post must belong to the (authorized) thread it is being deleted from.
    if (post.threadId !== threadId) {
      throw new DomainError('ERR_POST_NOT_FOUND');
    }

    if (post.authorHash.toString() !== input.authorHash) {
      throw new DomainError('ERR_AUTHORIZATION_FAILED');
    }

    await this.discussionRepo.softDelete(post.id, input.tid);

    await this.eventPublisher.publish('POST_DELETED', {
      reqId: input.reqId ?? '',
      postId: post.id,
      threadId,
      workspaceId: thread.workspaceId,
    });
  }
}
