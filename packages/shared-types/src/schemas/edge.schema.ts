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
  attributes: z.record(z.unknown()).default({}),
});

export type CreateEdgeInput = z.infer<typeof CreateEdgeSchema>;

export const UpdateEdgeSchema = z.object({
  relationKey: z.string().min(1).max(100).optional(),
  attributes: z.record(z.unknown()).optional(),
});

export type UpdateEdgeInput = z.infer<typeof UpdateEdgeSchema>;

/**
 * Stable JSON projection of an Edge — the element returned by
 * `GET /api/v1/edges/:id`, `GET /api/v1/edges` and `PATCH /api/v1/edges/:id`.
 *
 * It never leaks the raw entity internals (e.g. the `AuthorHash` value
 * object): the pseudonym is emitted as a string. The API owns the projection
 * (`EdgeController`); the PWA consumes the result read-only.
 */
export interface EdgeDto {
  id: string;
  workspaceId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationKey: string;
  attributes: Record<string, unknown>;
  /** The opaque per-user pseudonym of the author (ADR-0013). */
  authorHash: string;
  status: string;
  communityScore: number;
  /** ISO-8601 instant. */
  createdAt: string;
}
