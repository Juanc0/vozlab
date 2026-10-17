import { randomUUID } from 'node:crypto';
import { CreateThreadInput as CreateThreadDto } from '@vozlab/shared-types';
import { DiscussionThread } from '../../domain/entities/DiscussionThread.js';
import { resolveAuthorHash } from '../services/resolveAuthorHash.js';
import { IDiscussionRepository } from '../../domain/ports/IDiscussionRepository.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type CreateThreadInput = CreateThreadDto & {
  workspaceId: string;
  tid: string;
  authorHash: string;
  reqId?: string;
};

/**
 * Use Case: open a discussion thread on a governance target (RF-11).
 */
export class CreateThreadUseCase {
  constructor(
    private readonly discussionRepo: IDiscussionRepository,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: CreateThreadInput): Promise<DiscussionThread> {
    const thread = new DiscussionThread(
      randomUUID(),
      input.workspaceId,
      input.targetId,
      input.targetType,
      input.title,
      resolveAuthorHash(input.authorHash, input.authorHash)
    );

    await this.discussionRepo.saveThread(thread, input.tid);

    await this.eventPublisher.publish('THREAD_CREATED', {
      reqId: input.reqId ?? '',
      threadId: thread.id,
      targetId: thread.targetId,
      targetType: thread.targetType,
      workspaceId: thread.workspaceId,
    });

    return thread;
  }
}
