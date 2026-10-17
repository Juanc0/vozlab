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

/**
 * Query string for listing a target's discussion threads (NFR-04).
 * `limit` is clamped to 1..100 (default 20); `cursor` is the opaque keyset
 * token returned as `nextCursor` by a previous page.
 */
export const ListThreadsQuerySchema = z.object({
  targetId: z.string().uuid('targetId must be a valid UUID'),
  targetType: DiscussionTargetTypeSchema,
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type ListThreadsQueryInput = z.infer<typeof ListThreadsQuerySchema>;

/**
 * Query string for listing a thread's posts (NFR-04). Same pagination rules
 * as `ListThreadsQuerySchema`.
 */
export const ListPostsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type ListPostsQueryInput = z.infer<typeof ListPostsQuerySchema>;
