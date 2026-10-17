import { DomainError } from '../../domain/errors/DomainError.js';
import { INodeRepository, SubgraphResult } from '../../domain/ports/INodeRepository.js';

export type GetSubgraphInput = {
  rootId: string;
  workspaceId: string;
  tid: string;
  depth: number;
  limit: number;
};

/**
 * Use Case: bounded, workspace-scoped subgraph for a single PWA render
 * (NFR-01). The root must belong to the active workspace; a missing or
 * foreign root is indistinguishable (`ERR_NODE_NOT_FOUND`).
 */
export class GetSubgraphUseCase {
  constructor(private readonly nodeRepo: INodeRepository) {}

  async execute(input: GetSubgraphInput): Promise<SubgraphResult> {
    const root = await this.nodeRepo.findById(input.rootId, input.tid);
    if (!root || root.workspaceId !== input.workspaceId) {
      throw new DomainError('ERR_NODE_NOT_FOUND');
    }

    return this.nodeRepo.getSubgraph(
      input.rootId,
      input.workspaceId,
      { depth: input.depth, limit: input.limit },
      input.tid
    );
  }
}
