import { DomainError } from '../../domain/errors/DomainError.js';
import { INodeRepository } from '../../domain/ports/INodeRepository.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type DeleteNodeInput = {
  nodeId: string;
  workspaceId: string;
  tid: string;
  authorHash: string;
  reqId?: string;
};

/**
 * Use Case: soft-delete a node (governance keeps history).
 *
 * Only the author may delete their own node; the row is never hard-deleted,
 * only stamped with `deletedAt` by the repository (single writer, TASK-24).
 * Deleting an already-deleted node reads as not-found, so a second click is
 * idempotent from the client's perspective. The event is published
 * post-commit and best-effort.
 */
export class DeleteNodeUseCase {
  constructor(
    private readonly nodeRepo: INodeRepository,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: DeleteNodeInput): Promise<void> {
    // Workspace isolation (FR-05): a node in another workspace is reported as
    // not-found (never 403) so its existence is not leaked.
    const node = await this.nodeRepo.findById(input.nodeId, input.tid);
    if (!node || node.workspaceId !== input.workspaceId) {
      throw new DomainError('ERR_NODE_NOT_FOUND');
    }

    if (node.authorHash.toString() !== input.authorHash) {
      throw new DomainError('ERR_AUTHORIZATION_FAILED');
    }

    await this.nodeRepo.softDelete(node.id, input.tid);

    await this.eventPublisher.publish('NODE_DELETED', {
      reqId: input.reqId ?? '',
      nodeId: node.id,
      workspaceId: node.workspaceId,
    });
  }
}
