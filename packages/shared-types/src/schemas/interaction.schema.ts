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

/**
 * Payload for casting a vote.
 *
 * The numeric score delta is NOT part of the input contract: it is derived
 * server-side from `interactionType` (`DOWNVOTE` -> -1, everything else -> +1)
 * by `CastVoteUseCase`. Clients must not send a `value`; it is not accepted as
 * part of this schema and any such extra field is stripped by Zod.
 */
export const CastVoteSchema = z.object({
  targetId: z.string().uuid('targetId must be a valid UUID'),
  targetType: InteractionTargetTypeSchema,
  interactionType: InteractionTypeSchema,
});
export type CastVoteInput = z.infer<typeof CastVoteSchema>;
