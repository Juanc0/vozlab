import { DomainError } from '../../domain/errors/DomainError.js';
import { IEdgeRepository } from '../../domain/ports/IEdgeRepository.js';
import {
  DisplayNameCatalog,
  propertyNames,
  type NamedEdge
} from './DisplayNameCatalog.js';

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
 *
 * The edge carries the display names of its relation, so the reader sees the
 * name of the relation in the language of the interface.
 */
export class GetEdgeUseCase {
  constructor(
    private readonly edgeRepo: IEdgeRepository,
    private readonly names: DisplayNameCatalog
  ) {}

  async execute(input: GetEdgeInput): Promise<NamedEdge> {
    const [edge, metamodel] = await Promise.all([
      this.edgeRepo.findById(input.edgeId, input.tid),
      this.names.read(input.workspaceId, input.tid),
    ]);

    if (!edge || edge.workspaceId !== input.workspaceId) {
      throw new DomainError('ERR_EDGE_NOT_FOUND');
    }

    return { edge, relationDisplayNames: propertyNames(metamodel, edge.relationKey) };
  }
}
