import { DomainError } from '../../domain/errors/DomainError.js';
import {
  INodeRepository,
  NearestNeighborsResult,
} from '../../domain/ports/INodeRepository.js';

export type GetNodeNeighborsInput = {
  nodeId: string;
  workspaceId: string;
  tid: string;
  limit?: number;
};

/** Hard cap for the neighbour lookup (ADR-0022). */
const MAX_LIMIT = 10;
const DEFAULT_LIMIT = 5;

/**
 * Use Case: read the closest nodes of the workspace to a node
 * (FR-19, ADR-0022).
 *
 * This is the API's vector-search read path. The Relator (and later the PWA)
 * ask the API instead of touching the tenant database, so the workspace,
 * soft-delete and status filters exist in exactly one place.
 *
 * Three outcomes, three answers:
 *   - the node does not exist (or belongs to another workspace) →
 *     `404 ERR_NODE_NOT_FOUND` (ADR-0008 — existence is not leaked);
 *   - the node exists but has no vector yet → `409 ERR_NODE_NOT_EMBEDDED`,
 *     the retryable state ADR-0020 relies on;
 *   - otherwise the source node and its neighbours.
 */
export class GetNodeNeighborsUseCase {
  constructor(private readonly nodeRepo: INodeRepository) {}

  async execute(
    input: GetNodeNeighborsInput
  ): Promise<Extract<NearestNeighborsResult, { status: 'OK' }>> {
    const requested = input.limit ?? DEFAULT_LIMIT;
    const limit = Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT);

    const result = await this.nodeRepo.findNearestInWorkspace(
      input.nodeId,
      input.workspaceId,
      { limit },
      input.tid
    );

    if (result.status === 'NOT_FOUND') {
      throw new DomainError('ERR_NODE_NOT_FOUND');
    }
    if (result.status === 'NOT_EMBEDDED') {
      throw new DomainError('ERR_NODE_NOT_EMBEDDED');
    }

    return result;
  }
}
