import { INodeRepository } from '../../domain/ports/INodeRepository.js';
import {
  DisplayNameCatalog,
  classNames,
  type NamedNode
} from './DisplayNameCatalog.js';

export type ListNodesInput = {
  workspaceId: string;
  tid: string;
  limit: number;
  cursor?: string;
};

export type ListNodesResult = {
  items: NamedNode[];
  nextCursor: string | null;
};

/**
 * Use Case: cursor-paginated listing of the workspace's nodes (NFR-04).
 * Delegates keyset pagination to the repository port so the application
 * layer stays storage-agnostic.
 *
 * Every node carries the display names of its class: the page of the graph
 * speaks the language of the reader, not the keys of the system. The names
 * come from **one** read of the metamodel of the workspace, whatever the
 * number of nodes of the page is.
 */
export class ListNodesUseCase {
  constructor(
    private readonly nodeRepo: INodeRepository,
    private readonly names: DisplayNameCatalog
  ) {}

  async execute(input: ListNodesInput): Promise<ListNodesResult> {
    const [page, metamodel] = await Promise.all([
      this.nodeRepo.listByWorkspace(
        input.workspaceId,
        { limit: input.limit, cursor: input.cursor },
        input.tid
      ),
      this.names.read(input.workspaceId, input.tid),
    ]);

    return {
      items: page.items.map((node) => ({
        node,
        typeDisplayNames: classNames(metamodel, node.typeKey),
      })),
      nextCursor: page.nextCursor,
    };
  }
}
