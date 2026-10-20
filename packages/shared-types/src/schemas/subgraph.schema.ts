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
 * carries only what a canvas needs to draw a relation — the endpoints, the
 * relation key and the status. The workspace, the attributes, the author
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
  status: EdgeStatus;
}

/** The body of `GET /api/v1/nodes/subgraph`. */
export interface SubgraphResponseDto {
  nodes: NodeDto[];
  edges: SubgraphEdgeDto[];
}
