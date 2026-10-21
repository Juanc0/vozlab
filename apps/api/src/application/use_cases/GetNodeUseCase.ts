import { DomainError } from '../../domain/errors/DomainError.js';
import { INodeRepository } from '../../domain/ports/INodeRepository.js';
import {
  DisplayNameCatalog,
  classNames,
  type NamedNode
} from './DisplayNameCatalog.js';

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
 *
 * The node carries the display names of its class, so the reader sees the
 * name of the class in the language of the interface and not the key of the
 * system.
 */
export class GetNodeUseCase {
  constructor(
    private readonly nodeRepo: INodeRepository,
    private readonly names: DisplayNameCatalog
  ) {}

  async execute(input: GetNodeInput): Promise<NamedNode> {
    const [node, metamodel] = await Promise.all([
      this.nodeRepo.findById(input.nodeId, input.tid),
      this.names.read(input.workspaceId, input.tid),
    ]);

    if (!node || node.workspaceId !== input.workspaceId) {
      throw new DomainError('ERR_NODE_NOT_FOUND');
    }

    return { node, typeDisplayNames: classNames(metamodel, node.typeKey) };
  }
}
