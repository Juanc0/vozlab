import { AuthorHash } from '../value_objects/AuthorHash.js';

/**
 * Interaction entity — immutable record of a community action (RF-14).
 * The (user, target) uniqueness is enforced at the persistence layer.
 * Pure domain object.
 */
export type InteractionTargetType = 'NODE' | 'EDGE' | 'PROPOSAL' | 'POST';
export type InteractionType = 'UPVOTE' | 'DOWNVOTE' | 'SUPPORT' | 'VALIDATE';

export class Interaction {
  constructor(
    public readonly id: string,
    public readonly workspaceId: string,
    public readonly userHash: AuthorHash,
    public readonly targetId: string,
    public readonly targetType: InteractionTargetType,
    public readonly interactionType: InteractionType,
    public readonly value: number = 1,
    public readonly createdAt: Date = new Date()
  ) {}
}
