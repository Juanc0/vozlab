/**
 * The vote (FR-14, FR-15).
 *
 * `POST /api/v1/interactions` is the **only** write of a vote: the API has
 * no read, no retraction and no change-vote route. The consequences are
 * visible in the contract:
 *
 * - `value` is derived by the server (`DOWNVOTE` → `-1`, the others → `+1`);
 *   the client must not send it;
 * - repeating the **same** interaction type is idempotent (the server
 *   answers `201` with the existing row and does **not** move the counter
 *   again);
 * - a **different** type for the same user and target is `409
 *   ERR_DUPLICATE_INTERACTION`;
 * - the target must exist in the workspace, or the API answers the
 *   type-specific `404`.
 *
 * The PWA therefore keeps the vote state **in the session**: it is the only
 * place where "which vote did I cast?" can be answered.
 */

import type { ApiClient } from './client';
import type { InteractionDto, InteractionTargetType, InteractionType } from './types';

/** The score delta the server derives from the interaction type. */
export function interactionValue(interactionType: InteractionType): number {
  return interactionType === 'DOWNVOTE' ? -1 : 1;
}

/**
 * Casts a vote.
 *
 * The `value` is never sent: the server derives it. The answer carries the
 * derived value, which is what the client uses to reconcile its optimistic
 * score.
 */
export async function castVote(
  client: ApiClient,
  input: {
    readonly targetId: string;
    readonly targetType: InteractionTargetType;
    readonly interactionType: InteractionType;
  }
): Promise<InteractionDto> {
  return client.request<InteractionDto>({
    method: 'POST',
    path: '/interactions',
    body: {
      targetId: input.targetId,
      targetType: input.targetType,
      interactionType: input.interactionType
    }
  });
}
