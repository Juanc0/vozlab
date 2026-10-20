import { INodeRepository, SubgraphResult } from '../../domain/ports/INodeRepository.js';

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
 */
export class GetNodeWindowUseCase {
  constructor(private readonly nodeRepo: INodeRepository) {}

  async execute(input: GetNodeWindowInput): Promise<SubgraphResult> {
    const requested = input.limit ?? DEFAULT_LIMIT;
    const limit = Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT);

    return this.nodeRepo.getWindowInWorkspace(
      input.workspaceId,
      { limit },
      input.tid
    );
  }
}
