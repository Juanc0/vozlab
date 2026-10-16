import { z } from 'zod';

/**
 * Zod schemas for directed edges between nodes (RF-08).
 * Relation domain/range restrictions are validated in the use case against
 * the workspace ontology (`meta.object_properties`).
 */
export const CreateEdgeSchema = z.object({
  sourceNodeId: z.string().uuid('sourceNodeId must be a valid UUID'),
  targetNodeId: z.string().uuid('targetNodeId must be a valid UUID'),
  relationKey: z.string().min(1, 'relationKey is required').max(100),
  attributes: z.record(z.any()).default({}),
});

export type CreateEdgeInput = z.infer<typeof CreateEdgeSchema>;

export const UpdateEdgeSchema = z.object({
  relationKey: z.string().min(1).max(100).optional(),
  attributes: z.record(z.any()).optional(),
});

export type UpdateEdgeInput = z.infer<typeof UpdateEdgeSchema>;
