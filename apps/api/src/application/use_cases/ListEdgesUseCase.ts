import { Edge } from '../../domain/entities/Edge.js';
import { IEdgeRepository } from '../../domain/ports/IEdgeRepository.js';

export type ListEdgesInput = {
  workspaceId: string;
  tid: string;
  limit: number;
  cursor?: string;
};

export type ListEdgesResult = {
  items: Edge[];
  nextCursor: string | null;
};

/**
 * Use Case: cursor-paginated listing of the workspace's edges (NFR-04).
 * Delegates keyset pagination to the repository port so the application
 * layer stays storage-agnostic.
 */
export class ListEdgesUseCase {
  constructor(private readonly edgeRepo: IEdgeRepository) {}

  async execute(input: ListEdgesInput): Promise<ListEdgesResult> {
    return this.edgeRepo.listByWorkspace(
      input.workspaceId,
      { limit: input.limit, cursor: input.cursor },
      input.tid
    );
  }
}
