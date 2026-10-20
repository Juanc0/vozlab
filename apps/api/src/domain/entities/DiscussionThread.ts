import { AuthorHash } from '../value_objects/AuthorHash.js';
import { DomainError } from '../errors/DomainError.js';
import type { DiscussionTargetType, ThreadStatus } from '@vozlab/shared-types';

/**
 * DiscussionThread entity — governance debate attached to any target
 * (RF-11). Pure domain object.
 *
 * The status and target-type vocabularies are declared once, in
 * `@vozlab/shared-types` (`ThreadStatusSchema`, `DiscussionTargetTypeSchema`);
 * `ThreadStatus` is re-exported here so the call sites that import it from
 * this entity keep working.
 */
export type { ThreadStatus };

export class DiscussionThread {
  constructor(
    public readonly id: string,
    public readonly workspaceId: string,
    public readonly targetId: string,
    public readonly targetType: DiscussionTargetType,
    public title: string,
    public readonly createdByHash: AuthorHash,
    public status: ThreadStatus = 'OPEN',
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {}

  close(): void {
    if (this.status === 'CLOSED') {
      throw new DomainError('ERR_INVALID_STATE_TRANSITION', 'thread is already closed');
    }
    this.status = 'CLOSED';
    this.updatedAt = new Date();
  }
}
