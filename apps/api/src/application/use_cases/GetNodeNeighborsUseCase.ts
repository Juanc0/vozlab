import { DomainError } from '../../domain/errors/DomainError.js';
import {
  INodeRepository,
  NodeNeighbor,
} from '../../domain/ports/INodeRepository.js';
import {
  DisplayNameCatalog,
  classNames,
  type DisplayNames,
} from './DisplayNameCatalog.js';

export type GetNodeNeighborsInput = {
  nodeId: string;
  workspaceId: string;
  tid: string;
  limit?: number;
};

/** Hard cap for the neighbour lookup (ADR-0022). */
const MAX_LIMIT = 10;
const DEFAULT_LIMIT = 5;

/** The node the search starts from, with the names of its class. */
export interface NeighborSource {
  id: string;
  typeKey: string;
  title: string;
  description: string | null;
  status: string;
  typeDisplayNames: DisplayNames;
}

/** The result of the neighbour lookup, with the names of the classes. */
export interface NeighborsResult {
  readonly source: NeighborSource;
  readonly neighbors: Array<NodeNeighbor & { typeDisplayNames: DisplayNames }>;
}

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
 *
 * The nodes carry the display names of their class: the names come from
 * **one** read of the metamodel of the workspace.
 */
export class GetNodeNeighborsUseCase {
  constructor(
    private readonly nodeRepo: INodeRepository,
    private readonly names: DisplayNameCatalog
  ) {}

  async execute(input: GetNodeNeighborsInput): Promise<NeighborsResult> {
    const requested = input.limit ?? DEFAULT_LIMIT;
    const limit = Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT);

    const [result, metamodel] = await Promise.all([
      this.nodeRepo.findNearestInWorkspace(
        input.nodeId,
        input.workspaceId,
        { limit },
        input.tid
      ),
      this.names.read(input.workspaceId, input.tid),
    ]);

    if (result.status === 'NOT_FOUND') {
      throw new DomainError('ERR_NODE_NOT_FOUND');
    }
    if (result.status === 'NOT_EMBEDDED') {
      throw new DomainError('ERR_NODE_NOT_EMBEDDED');
    }

    const found = result;

    return {
      source: {
        ...found.source,
        typeDisplayNames: classNames(metamodel, found.source.typeKey),
      },
      neighbors: found.neighbors.map((neighbor) => ({
        ...neighbor,
        typeDisplayNames: classNames(metamodel, neighbor.typeKey),
      })),
    };
  }
}