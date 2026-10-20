import { AuthorHash } from '../value_objects/AuthorHash.js';
import type {
  InteractionTargetType,
  InteractionType,
} from '@vozlab/shared-types';

/**
 * Interaction entity — immutable record of a community action (RF-14).
 * The (user, target) uniqueness is enforced at the persistence layer.
 * Pure domain object.
 *
 * The target-type and interaction-type vocabularies are declared once, in
 * `@vozlab/shared-types` (`InteractionTargetTypeSchema`,
 * `InteractionTypeSchema`); they are re-exported here so the call sites
 * that import them from this entity keep working.
 */
export type { InteractionTargetType, InteractionType };

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
