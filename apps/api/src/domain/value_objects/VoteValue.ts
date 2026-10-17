import { InteractionType } from '@vozlab/shared-types';

/**
 * Value Object: VoteValue
 *
 * The single mapping `interactionType -> numeric score delta` (RF-14).
 * Keeping it here (and nowhere else) guarantees the derived value can never
 * disagree between the interactions log and the denormalized counters.
 * Pure domain object: the numeric value is always server-derived and is never
 * accepted from the client.
 */
export class VoteValue {
  private constructor(public readonly value: number) {}

  static fromInteractionType(type: InteractionType): VoteValue {
    if (type === 'DOWNVOTE') return new VoteValue(-1);
    // UPVOTE | SUPPORT | VALIDATE are all positive endorsements.
    return new VoteValue(1);
  }

  static fromNumber(value: number): VoteValue {
    return new VoteValue(value);
  }

  isPositive(): boolean {
    return this.value > 0;
  }

  toString(): string {
    return String(this.value);
  }
}
