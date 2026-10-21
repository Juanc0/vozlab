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
 * The shape is the **relation of the graph**: the topology (the endpoints
 * and the relation key), the display names of the relation, the attributes of
 * the relation, the pseudonym of its author, its status, its community score
 * and the instant it was created.
 *
 * It is the same relation the full edge carries (`EdgeDto`), minus the
 * workspace: the attributes, the pseudonym and the instant are **the same
 * values** — the subgraph does not have a second shape of the attributes,
 * and the canvas reads one contract for a relation whether it got it from
 * the window or from `GET /api/v1/edges/:id`.
 *
 * The workspace is not part of it: the subgraph is already scoped to the
 * workspace of the request, and the reader of the graph never needs it.
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
  /**
   * The attributes of the relation — the JSONB of the row.
   *
   * The **same** map the full edge carries (`EdgeDto.attributes`): a
   * relation without attributes carries an empty object, never `null` and
   * never a partial map.
   */
  attributes: Record<string, unknown>;
  /**
   * The opaque per-user pseudonym of the author (ADR-0013).
   *
   * The **pseudonym**, never the identity: the graph never carries the user,
   * the email or the id of the author — only the opaque handle the API
   * compares.
   */
  authorHash: string;
  status: EdgeStatus;
  /** The community score of the relation; the canvas votes on it. */
  communityScore: number;
  /** ISO-8601 instant — the moment the relation was created. */
  createdAt: string;
}

/** The body of `GET /api/v1/nodes/subgraph`. */
export interface SubgraphResponseDto {
  nodes: NodeDto[];
  edges: SubgraphEdgeDto[];
}
