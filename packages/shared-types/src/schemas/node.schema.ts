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
 * Zod schema for updating an existing Node (partial update via edit proposals).
 */
export const UpdateNodeSchema = z.object({
  title: z.string().min(3).max(255).optional(),
  description: z.string().optional(),
  attributes: z.record(z.unknown()).optional(),
});

export type UpdateNodeInput = z.infer<typeof UpdateNodeSchema>;