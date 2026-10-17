import { Node } from '../../domain/entities/Node.js';
import { INodeRepository } from '../../domain/ports/INodeRepository.js';

export type ListNodesInput = {
  workspaceId: string;
  tid: string;
  limit: number;
  cursor?: string;
};

export type ListNodesResult = {
  items: Node[];
  nextCursor: string | null;
};

/**
 * Use Case: cursor-paginated listing of the workspace's nodes (NFR-04).
 * Delegates keyset pagination to the repository port so the application
 * layer stays storage-agnostic.
 */
export class ListNodesUseCase {
  constructor(private readonly nodeRepo: INodeRepository) {}

  async execute(input: ListNodesInput): Promise<ListNodesResult> {
    return this.nodeRepo.listByWorkspace(
      input.workspaceId,
      { limit: input.limit, cursor: input.cursor },
      input.tid
    );
  }
}
