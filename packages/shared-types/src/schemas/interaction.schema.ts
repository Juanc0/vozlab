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
 * server-side from `interactionType` by the domain value object
 * `domain/value_objects/VoteValue.ts` (`DOWNVOTE` -> -1,
 * `UPVOTE` | `SUPPORT` | `VALIDATE` -> +1). Clients must not send a `value`; it
 * is not accepted as part of this schema and any such extra field is stripped
 * by Zod.
 */
export const CastVoteSchema = z.object({
  targetId: z.string().uuid('targetId must be a valid UUID'),
  targetType: InteractionTargetTypeSchema,
  interactionType: InteractionTypeSchema,
});
export type CastVoteInput = z.infer<typeof CastVoteSchema>;

/**
 * Stable JSON projection of a community interaction — the body returned by
 * `POST /api/v1/interactions`.
 *
 * `value` is the score delta the server derived from `interactionType`
 * (`DOWNVOTE` -> -1, the other types -> +1); the client never sends it. The
 * PWA uses it to roll back an optimistic vote when the call fails.
 */
export interface InteractionDto {
  id: string;
  targetId: string;
  targetType: InteractionTargetType;
  interactionType: InteractionType;
  /** The score delta applied to the target (+1 or -1). */
  value: number;
}
