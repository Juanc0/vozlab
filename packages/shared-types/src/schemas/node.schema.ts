import { z } from 'zod';

/**
 * Zod schema for creating a new Node in the knowledge graph.
 * Validates all incoming HTTP payloads for node creation.
 */
export const CreateNodeSchema = z.object({
  typeKey: z.string().min(1, 'typeKey is required').max(100, 'typeKey must be at most 100 chars'),
  title: z.string().min(3, 'title must be at least 3 chars').max(255, 'title must be at most 255 chars'),
  description: z.string().optional(),
  attributes: z.record(z.unknown()).default({}),
});

export type CreateNodeInput = z.infer<typeof CreateNodeSchema>;

/**
 * Zod schema for the node list query string (NFR-04).
 * `limit` is clamped to 1..100 (default 20); `cursor` is the opaque
 * keyset token returned as `nextCursor` by a previous page.
 */
export const ListNodeQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export type ListNodeQueryInput = z.infer<typeof ListNodeQuerySchema>;

/**
 * Zod schema for the neighbour lookup query string
 * (`GET /api/v1/nodes/:id/neighbors`, ADR-0022).
 *
 * `limit` is clamped to 1..10 (default 5 — the Relator's top-5).
 */
export const NeighborsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export type NeighborsQueryInput = z.infer<typeof NeighborsQuerySchema>;

/**
 * Zod schema for updating an existing Node (partial update via edit proposals).
 */
export const UpdateNodeSchema = z.object({
  title: z.string().min(3).max(255).optional(),
  description: z.string().optional(),
  attributes: z.record(z.unknown()).optional(),
});

export type UpdateNodeInput = z.infer<typeof UpdateNodeSchema>;

/**
 * Dimensionality of the embedding vector (FR-18, ADR-0020).
 * `public.nodes.embedding` is `vector(768)` and the only accepted model in
 * Phase 2 is `nomic-embed-text`, which produces exactly 768 dimensions.
 */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * Zod schema for the agent-only embedding write-back
 * (`PUT /api/v1/nodes/:id/embedding`, ADR-0020).
 *
 * The vector must contain exactly `EMBEDDING_DIMENSIONS` finite numbers; the
 * model identifies the embedding space the vector belongs to and is checked
 * against the deployment's `EMBEDDING_MODEL` by the API.
 */
export const SetNodeEmbeddingSchema = z.object({
  embedding: z
    .array(z.number().finite('embedding values must be finite numbers'))
    .length(EMBEDDING_DIMENSIONS, `embedding must have exactly ${EMBEDDING_DIMENSIONS} dimensions`),
  model: z.string().min(1, 'model is required').max(100, 'model must be at most 100 chars'),
});

export type SetNodeEmbeddingInput = z.infer<typeof SetNodeEmbeddingSchema>;