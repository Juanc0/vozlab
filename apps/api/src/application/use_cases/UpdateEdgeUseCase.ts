import { UpdateEdgeInput as UpdateEdgeDto } from '@vozlab/shared-types';
import { Edge } from '../../domain/entities/Edge.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IEdgeRepository } from '../../domain/ports/IEdgeRepository.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type UpdateEdgeInput = UpdateEdgeDto & {
  edgeId: string;
  workspaceId: string;
  tid: string;
  authorHash: string;
  reqId?: string;
};

/**
 * Use Case: partial update of an edge (relationKey / attributes).
 *
 * Only the author may mutate their own edge; workspace isolation makes a
 * foreign edge indistinguishable from a missing one. The event is published
 * post-commit and best-effort — a broker failure never rolls back the write.
 */
export class UpdateEdgeUseCase {
  constructor(
    private readonly edgeRepo: IEdgeRepository,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: UpdateEdgeInput): Promise<Edge> {
    const edge = await this.edgeRepo.findById(input.edgeId, input.tid);
    if (!edge || edge.workspaceId !== input.workspaceId) {
      throw new DomainError('ERR_EDGE_NOT_FOUND');
    }

    if (edge.authorHash.toString() !== input.authorHash) {
      throw new DomainError('ERR_AUTHORIZATION_FAILED');
    }

    if (input.attributes) {
      edge.updateAttributes(input.attributes);
    }
    if (input.relationKey !== undefined) {
      edge.relationKey = input.relationKey;
    }

    await this.edgeRepo.update(edge, input.tid);

    await this.eventPublisher.publish('EDGE_UPDATED', {
      reqId: input.reqId ?? '',
      edgeId: edge.id,
      workspaceId: edge.workspaceId,
      relationKey: edge.relationKey,
    });

    return edge;
  }
}
