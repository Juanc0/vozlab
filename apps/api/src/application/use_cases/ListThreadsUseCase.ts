import { DiscussionThread } from '../../domain/entities/DiscussionThread.js';
import type { DiscussionTargetType } from '@vozlab/shared-types';
import { IDiscussionRepository } from '../../domain/ports/IDiscussionRepository.js';

export type ListThreadsInput = {
  targetId: string;
  targetType: DiscussionTargetType;
  workspaceId: string;
  tid: string;
  limit: number;
  cursor?: string;
};

export type ListThreadsResult = {
  items: DiscussionThread[];
  nextCursor: string | null;
};

/**
 * Use Case: cursor-paginated listing of a target's discussion threads
 * (RF-11, NFR-04). Delegates keyset pagination to the repository port so the
 * application layer stays storage-agnostic.
 */
export class ListThreadsUseCase {
  constructor(private readonly discussionRepo: IDiscussionRepository) {}

  async execute(input: ListThreadsInput): Promise<ListThreadsResult> {
    return this.discussionRepo.listThreads(
      input.targetId,
      input.targetType,
      {
        workspaceId: input.workspaceId,
        limit: input.limit,
        cursor: input.cursor,
      },
      input.tid
    );
  }
}
