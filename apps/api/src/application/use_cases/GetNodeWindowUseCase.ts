import { INodeRepository } from '../../domain/ports/INodeRepository.js';
import {
  DisplayNameCatalog,
  classNames,
  propertyNames,
  type NamedNode,
  type NamedRelation
} from './DisplayNameCatalog.js';

export type GetNodeWindowInput = {
  workspaceId: string;
  tid: string;
  /** The number of nodes; clamped to 1..200. Defaults to 100. */
  limit?: number;
};

/** The same ceiling the subgraph uses (a pathological workspace must not blow up a render). */
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 100;

/**
 * Use Case: a bounded window over the whole workspace (roadmap 3.11).
 *
 * The subgraph answers "the neighbourhood of one node"; the window answers
 * "the workspace as a landscape": the most recent nodes, newest first, and
 * the relations among them. There is no root — the caller (the exploration
 * view) decides where to focus.
 *
 * The window is workspace-scoped: only the nodes of the request workspace
 * are in it, and the relations are the ones whose **both** endpoints are in
 * the window. An empty workspace is not an error — it is an empty window.
 *
 * The nodes carry the display names of their class and the relations carry
 * the display names of their property, read **once** for the whole window.
 */
export class GetNodeWindowUseCase {
  constructor(
    private readonly nodeRepo: INodeRepository,
    private readonly names: DisplayNameCatalog
  ) {}

  async execute(input: GetNodeWindowInput): Promise<{
    nodes: NamedNode[];
    relations: NamedRelation[];
  }> {
    const requested = input.limit ?? DEFAULT_LIMIT;
    const limit = Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT);

    const [window, metamodel] = await Promise.all([
      this.nodeRepo.getWindowInWorkspace(input.workspaceId, { limit }, input.tid),
      this.names.read(input.workspaceId, input.tid),
    ]);

    return {
      nodes: window.nodes.map((node) => ({
        node,
        typeDisplayNames: classNames(metamodel, node.typeKey),
      })),
      relations: window.edges.map((relation) => ({
        relation,
        relationDisplayNames: propertyNames(metamodel, relation.relationKey),
      })),
    };
  }
}
