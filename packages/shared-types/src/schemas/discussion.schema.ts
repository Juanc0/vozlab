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

/**
 * Stable JSON projection of a discussion thread — the element returned by
 * `GET /api/v1/discussions` and `PUT /api/v1/discussions/:threadId/close`.
 *
 * It never leaks the raw entity internals (e.g. the `AuthorHash` value
 * object): the pseudonym is emitted as a string. The API owns the projection
 * (`DiscussionController`); the PWA consumes the result read-only.
 */
export interface ThreadDto {
  id: string;
  workspaceId: string;
  targetId: string;
  targetType: string;
  title: string;
  status: string;
  /** The opaque per-user pseudonym of the creator (ADR-0013). */
  createdByHash: string;
  /** ISO-8601 instant. */
  createdAt: string;
  /** ISO-8601 instant. */
  updatedAt: string;
}

/**
 * Stable JSON projection of a discussion post — the element returned by
 * `GET /api/v1/discussions/:threadId/posts`.
 *
 * It never leaks the raw entity internals (e.g. the `AuthorHash` value
 * object): the pseudonym is emitted as a string. The API owns the projection
 * (`DiscussionController`); the PWA consumes the result read-only.
 */
export interface PostDto {
  id: string;
  threadId: string;
  /** `null` for a top-level post. */
  parentPostId: string | null;
  /** The opaque per-user pseudonym of the author (ADR-0013). */
  authorHash: string;
  body: string;
  upvotes: number;
  downvotes: number;
  communityScore: number;
  /** ISO-8601 instant. */
  createdAt: string;
}
