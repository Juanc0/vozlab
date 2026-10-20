import { z } from 'zod';
import type { NodeDto } from './node.schema.js';
import type { SubgraphEdgeDto } from './subgraph.schema.js';

/**
 * Hard ceiling of the exploration window: the same bound the subgraph uses,
 * for the same reason — a pathological workspace must not blow up a single
 * render.
 */
export const NODE_WINDOW_MAX_LIMIT = 200;

/** The window is a landscape, not a page: the default is generous. */
export const NODE_WINDOW_DEFAULT_LIMIT = 100;

/**
 * Zod schema for the exploration window query string
 * (`GET /api/v1/nodes/window`).
 *
 * `limit` is **clamped**, not validated: a client asking for more than the
 * ceiling (or for none at all) gets the closest legal window instead of an
 * error, so the exploration view can ask for "as much as possible" without
 * knowing the bound. The value is coerced first, so `?limit=5` and
 * `?limit=5.0` are the same request.
 *
 * The order matters: the default is applied by the inner schema and the
 * clamp runs on whatever the inner schema produced, so an absent parameter
 * ends at the default (100) and not at the ceiling.
 */
export const NodeWindowQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int('limit must be an integer')
    .default(NODE_WINDOW_DEFAULT_LIMIT)
    .transform((value) => Math.min(Math.max(value, 1), NODE_WINDOW_MAX_LIMIT)),
});

export type NodeWindowQueryInput = z.infer<typeof NodeWindowQuerySchema>;

/**
 * The body of `GET /api/v1/nodes/window`.
 *
 * It is the subgraph's shape on purpose: the exploration view and the
 * subgraph view draw the same canvas, so both answers speak the same
 * language — a list of nodes and the relations among them.
 *
 * The window is a **closed** graph: every edge returned has both of its
 * endpoints in `nodes`. An edge to a node outside the window is not
 * returned, so the canvas never has to draw a node it does not know.
 */
export interface NodeWindowResponseDto {
  nodes: NodeDto[];
  edges: SubgraphEdgeDto[];
}
