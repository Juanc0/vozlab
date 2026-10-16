import { z } from 'zod';

/**
 * Zod schemas for community interactions (RF-14).
 * One active vote per user/target is enforced by the DB unique constraint
 * `unique_user_target_vote`.
 */

export const InteractionTargetTypeSchema = z.enum([
  'NODE',
  'EDGE',
  'PROPOSAL',
  'POST',
]);
export type InteractionTargetType = z.infer<typeof InteractionTargetTypeSchema>;

export const InteractionTypeSchema = z.enum([
  'UPVOTE',
  'DOWNVOTE',
  'SUPPORT',
  'VALIDATE',
]);
export type InteractionType = z.infer<typeof InteractionTypeSchema>;

export const CastVoteSchema = z.object({
  targetId: z.string().uuid('targetId must be a valid UUID'),
  targetType: InteractionTargetTypeSchema,
  interactionType: InteractionTypeSchema,
  value: z.number().int().min(-1).max(1).default(1),
});
export type CastVoteInput = z.infer<typeof CastVoteSchema>;
