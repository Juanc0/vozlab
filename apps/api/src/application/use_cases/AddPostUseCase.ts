import { randomUUID } from 'node:crypto';
import { CreatePostInput as CreatePostDto } from '@vozlab/shared-types';
import { DiscussionPost } from '../../domain/entities/DiscussionPost.js';
import { AuthorHash } from '../../domain/value_objects/AuthorHash.js';
import { IDiscussionRepository } from '../../domain/ports/IDiscussionRepository.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type AddPostInput = CreatePostDto & {
  threadId: string;
  workspaceId: string;
  tid: string;
  authorHash: string;
  reqId?: string;
};

/**
 * Use Case: add a (possibly nested) comment to a discussion thread (RF-16).
 */
export class AddPostUseCase {
  constructor(
    private readonly discussionRepo: IDiscussionRepository,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: AddPostInput): Promise<DiscussionPost> {
    const thread = await this.discussionRepo.findThreadById(input.threadId, input.tid);
    if (!thread) {
      throw new Error('ERR_THREAD_NOT_FOUND');
    }

    const post = new DiscussionPost(
      randomUUID(),
      input.threadId,
      input.parentPostId ?? null,
      AuthorHash.fromRawOrIdentity(input.authorHash, 'default-salt'),
      input.body
    );

    await this.discussionRepo.savePost(post, input.tid);

    await this.eventPublisher.publish('POST_CREATED', {
      reqId: input.reqId ?? '',
      postId: post.id,
      threadId: post.threadId,
      parentPostId: post.parentPostId,
      workspaceId: input.workspaceId,
    });

    return post;
  }
}
