import { AuthorHash } from '../value_objects/AuthorHash.js';
import { DomainError } from '../errors/DomainError.js';

/**
 * DiscussionThread entity — governance debate attached to any target
 * (RF-11). Pure domain object.
 */
export type ThreadTargetType = 'NODE' | 'EDGE' | 'PROPOSAL' | 'ONTOLOGY';
export type ThreadStatus = 'OPEN' | 'CLOSED';

export class DiscussionThread {
  constructor(
    public readonly id: string,
    public readonly workspaceId: string,
    public readonly targetId: string,
    public readonly targetType: ThreadTargetType,
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
