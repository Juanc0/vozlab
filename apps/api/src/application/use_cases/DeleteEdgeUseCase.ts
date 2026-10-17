import { DomainError } from '../../domain/errors/DomainError.js';
import { IEdgeRepository } from '../../domain/ports/IEdgeRepository.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type DeleteEdgeInput = {
  edgeId: string;
  workspaceId: string;
  tid: string;
  authorHash: string;
  reqId?: string;
};

/**
 * Use Case: soft-delete an edge (governance keeps history).
 *
 * Only the author may delete their own edge; the row is never hard-deleted,
 * only stamped with `deletedAt`. The event is published post-commit and
 * best-effort.
 */
export class DeleteEdgeUseCase {
  constructor(
    private readonly edgeRepo: IEdgeRepository,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: DeleteEdgeInput): Promise<void> {
    const edge = await this.edgeRepo.findById(input.edgeId, input.tid);
    if (!edge || edge.workspaceId !== input.workspaceId) {
      throw new DomainError('ERR_EDGE_NOT_FOUND');
    }

    if (edge.authorHash.toString() !== input.authorHash) {
      throw new DomainError('ERR_AUTHORIZATION_FAILED');
    }

    await this.edgeRepo.softDelete(edge.id, input.tid);

    await this.eventPublisher.publish('EDGE_DELETED', {
      reqId: input.reqId ?? '',
      edgeId: edge.id,
      workspaceId: edge.workspaceId,
    });
  }
}
