import { z } from 'zod';
import type { EdgeStatus } from './edge.schema.js';
import type { NodeDto } from './node.schema.js';

/**
 * Zod schema for the subgraph query string (NFR-01).
 * `rootId` anchors the traversal; `depth` is the number of undirected hops
 * (capped at 3) and `limit` the maximum number of nodes returned (capped at
 * 200 so a pathological graph cannot blow up a single render).
 */
export const SubgraphQuerySchema = z.object({
  rootId: z.string().uuid('rootId must be a valid UUID'),
  depth: z.coerce.number().int().min(0).max(3).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type SubgraphQueryInput = z.infer<typeof SubgraphQuerySchema>;

/**
 * An edge **as the subgraph returns it**.
 *
 * This is deliberately narrower than `EdgeDto`: the subgraph projection
 * carries only what a canvas needs to draw and vote on a relation — the
 * endpoints, the relation key, the display names of the relation, the status
 * and the community score. The workspace, the attributes, the author
 * pseudonym, the score and the timestamps are not part of it.
 *
 * The PWA draws the subgraph, so the shape has to be shared rather than
 * inferred from the controller.
 */
export interface SubgraphEdgeDto {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationKey: string;
  /**
   * The **display names** of the relation, by language.
   *
   * The same map the full edge carries (`EdgeDto.relationDisplayNames`): the
   * canvas paints the label of a relation, and the label is a name in the
   * language of the reader, not the key of the system.
   */
  relationDisplayNames: Record<string, string>;
  status: EdgeStatus;
  /** The community score of the relation; the canvas votes on it. */
  communityScore: number;
}

/** The body of `GET /api/v1/nodes/subgraph`. */
export interface SubgraphResponseDto {
  nodes: NodeDto[];
  edges: SubgraphEdgeDto[];
}
