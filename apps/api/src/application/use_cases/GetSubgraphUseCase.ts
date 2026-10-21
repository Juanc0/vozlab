import { DomainError } from '../../domain/errors/DomainError.js';
import { INodeRepository } from '../../domain/ports/INodeRepository.js';
import {
  DisplayNameCatalog,
  classNames,
  propertyNames,
  type NamedNode,
  type NamedRelation
} from './DisplayNameCatalog.js';

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
 *
 * The nodes carry the display names of their class and the relations carry
 * the display names of their property. The names come from **one** read of
 * the metamodel of the workspace: a subgraph of two hundred nodes and two
 * hundred relations is two queries of names, not four hundred.
 */
export class GetSubgraphUseCase {
  constructor(
    private readonly nodeRepo: INodeRepository,
    private readonly names: DisplayNameCatalog
  ) {}

  async execute(input: GetSubgraphInput): Promise<{
    nodes: NamedNode[];
    relations: NamedRelation[];
  }> {
    const root = await this.nodeRepo.findById(input.rootId, input.tid);
    if (!root || root.workspaceId !== input.workspaceId) {
      throw new DomainError('ERR_NODE_NOT_FOUND');
    }

    const [subgraph, metamodel] = await Promise.all([
      this.nodeRepo.getSubgraph(
        input.rootId,
        input.workspaceId,
        { depth: input.depth, limit: input.limit },
        input.tid
      ),
      this.names.read(input.workspaceId, input.tid),
    ]);

    return {
      nodes: subgraph.nodes.map((node) => ({
        node,
        typeDisplayNames: classNames(metamodel, node.typeKey),
      })),
      relations: subgraph.edges.map((relation) => ({
        relation,
        relationDisplayNames: propertyNames(metamodel, relation.relationKey),
      })),
    };
  }
}
