import { Node } from '../../domain/entities/Node.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { INodeRepository } from '../../domain/ports/INodeRepository.js';

export type GetNodeInput = {
  nodeId: string;
  workspaceId: string;
  tid: string;
};

/**
 * Use Case: read a single node owned by the active workspace.
 *
 * Enforces workspace isolation at the application boundary: a node that
 * exists but belongs to another workspace is indistinguishable from a
 * missing one (`ERR_NODE_NOT_FOUND`).
 */
export class GetNodeUseCase {
  constructor(private readonly nodeRepo: INodeRepository) {}

  async execute(input: GetNodeInput): Promise<Node> {
    const node = await this.nodeRepo.findById(input.nodeId, input.tid);
    if (!node || node.workspaceId !== input.workspaceId) {
      throw new DomainError('ERR_NODE_NOT_FOUND');
    }
    return node;
  }
}
