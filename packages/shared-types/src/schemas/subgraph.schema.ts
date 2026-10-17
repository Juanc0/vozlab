import { z } from 'zod';

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
