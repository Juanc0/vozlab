import { DiscussionThread } from '../../domain/entities/DiscussionThread.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IDiscussionRepository } from '../../domain/ports/IDiscussionRepository.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type CloseThreadInput = {
  threadId: string;
  workspaceId: string;
  tid: string;
  authorHash: string;
  reqId?: string;
};

/**
 * Use Case: close a discussion thread (RF-11).
 *
 * Only the thread's creator may close it; the domain state machine
 * (`thread.close()`) rejects an already-closed thread with
 * `ERR_INVALID_STATE_TRANSITION` (422). The event is published post-commit
 * and best-effort.
 */
export class CloseThreadUseCase {
  constructor(
    private readonly discussionRepo: IDiscussionRepository,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: CloseThreadInput): Promise<DiscussionThread> {
    const thread = await this.discussionRepo.findThreadById(input.threadId, input.tid);
    if (!thread) {
      throw new DomainError('ERR_THREAD_NOT_FOUND');
    }

    // Workspace isolation (FR-05): a thread in another workspace is reported as
    // not-found (never 403) so its existence is not leaked.
    if (thread.workspaceId !== input.workspaceId) {
      throw new DomainError('ERR_THREAD_NOT_FOUND');
    }

    if (thread.createdByHash.toString() !== input.authorHash) {
      throw new DomainError('ERR_AUTHORIZATION_FAILED');
    }

    thread.close();
    await this.discussionRepo.updateThreadStatus(thread, input.tid);

    await this.eventPublisher.publish('THREAD_CLOSED', {
      reqId: input.reqId ?? '',
      threadId: thread.id,
      targetId: thread.targetId,
      targetType: thread.targetType,
      workspaceId: thread.workspaceId,
    });

    return thread;
  }
}
