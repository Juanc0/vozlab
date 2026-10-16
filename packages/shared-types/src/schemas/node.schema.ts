import { z } from 'zod';

/**
 * Zod schema for creating a new Node in the knowledge graph.
 * Validates all incoming HTTP payloads for node creation.
 */
export const CreateNodeSchema = z.object({
  typeKey: z.string().max(100, 'typeKey must be at most 100 chars'),
  title: z.string().min(3, 'title must be at least 3 chars').max(255, 'title must be at most 255 chars'),
  description: z.string().optional(),
  attributes: z.record(z.any()).default({}),
});

export type CreateNodeInput = z.infer<typeof CreateNodeSchema>;

/**
 * Zod schema for updating an existing Node (partial update via edit proposals).
 */
export const UpdateNodeSchema = z.object({
  title: z.string().min(3).max(255).optional(),
  description: z.string().optional(),
  attributes: z.record(z.any()).optional(),
});

export type UpdateNodeInput = z.infer<typeof UpdateNodeSchema>;