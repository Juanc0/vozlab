import { Edge } from '../../domain/entities/Edge.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IEdgeRepository } from '../../domain/ports/IEdgeRepository.js';

export type GetEdgeInput = {
  edgeId: string;
  workspaceId: string;
  tid: string;
};

/**
 * Use Case: read a single edge owned by the active workspace.
 *
 * Enforces workspace isolation at the application boundary: an edge that
 * exists but belongs to another workspace is indistinguishable from a
 * missing one (`ERR_EDGE_NOT_FOUND`).
 */
export class GetEdgeUseCase {
  constructor(private readonly edgeRepo: IEdgeRepository) {}

  async execute(input: GetEdgeInput): Promise<Edge> {
    const edge = await this.edgeRepo.findById(input.edgeId, input.tid);
    if (!edge || edge.workspaceId !== input.workspaceId) {
      throw new DomainError('ERR_EDGE_NOT_FOUND');
    }
    return edge;
  }
}
