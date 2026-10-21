import { IEdgeRepository } from '../../domain/ports/IEdgeRepository.js';
import {
  DisplayNameCatalog,
  propertyNames,
  type NamedEdge
} from './DisplayNameCatalog.js';

export type ListEdgesInput = {
  workspaceId: string;
  tid: string;
  limit: number;
  cursor?: string;
};

export type ListEdgesResult = {
  items: NamedEdge[];
  nextCursor: string | null;
};

/**
 * Use Case: cursor-paginated listing of the workspace's edges (NFR-04).
 * Delegates keyset pagination to the repository port so the application
 * layer stays storage-agnostic.
 *
 * Every relation carries the display names of its property: the names come
 * from **one** read of the metamodel of the workspace, whatever the number of
 * relations of the page is.
 */
export class ListEdgesUseCase {
  constructor(
    private readonly edgeRepo: IEdgeRepository,
    private readonly names: DisplayNameCatalog
  ) {}

  async execute(input: ListEdgesInput): Promise<ListEdgesResult> {
    const [page, metamodel] = await Promise.all([
      this.edgeRepo.listByWorkspace(
        input.workspaceId,
        { limit: input.limit, cursor: input.cursor },
        input.tid
      ),
      this.names.read(input.workspaceId, input.tid),
    ]);

    return {
      items: page.items.map((edge) => ({
        edge,
        relationDisplayNames: propertyNames(metamodel, edge.relationKey),
      })),
      nextCursor: page.nextCursor,
    };
  }
}
