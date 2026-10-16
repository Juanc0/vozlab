import { z } from 'zod';

/**
 * Zod schemas for governance discussion threads and threaded comments
 * (RF-11, RF-16).
 */

export const DiscussionTargetTypeSchema = z.enum([
  'NODE',
  'EDGE',
  'PROPOSAL',
  'ONTOLOGY',
]);
export type DiscussionTargetType = z.infer<typeof DiscussionTargetTypeSchema>;

export const CreateThreadSchema = z.object({
  targetId: z.string().uuid('targetId must be a valid UUID'),
  targetType: DiscussionTargetTypeSchema,
  title: z.string().min(3).max(255),
});
export type CreateThreadInput = z.infer<typeof CreateThreadSchema>;

export const CreatePostSchema = z.object({
  body: z.string().min(1).max(5000),
  parentPostId: z.string().uuid().optional(),
});
export type CreatePostInput = z.infer<typeof CreatePostSchema>;
