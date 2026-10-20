/**
 * The delta of a proposal — what it would change.
 *
 * `proposedChanges` is a `Record<string, unknown>`: the column is JSONB and
 * the DTO promises nothing about its content. The UI therefore treats it as
 * untrusted input: it renders the fields it finds and never assumes a shape.
 *
 * The one exception is the `MERGE` proposal (ADR-0026): its payload names
 * the **surviving** node in `mergeIntoNodeId`. That field is narrowed at
 * runtime with `MergeProposalChangesSchema` — a Zod `safeParse`, not a cast.
 * A malformed payload must not break the view: the proposal is shown
 * without a surviving node and the reason is stated.
 */

import { MergeProposalChangesSchema } from '@vozlab/shared-types';

/** One field of the delta. */
export interface DeltaEntry {
  /** The name of the field the proposal changes. */
  readonly field: string;
  /** The value the proposal would set. */
  readonly value: unknown;
}

/**
 * The delta as a list of `field → value` pairs.
 *
 * The order is stable (the fields are sorted by name) so the rendering does
 * not jump around between two reads of the same payload.
 */
export function deltaEntries(changes: Record<string, unknown> | null | undefined): DeltaEntry[] {
  if (changes === null || changes === undefined || typeof changes !== 'object') {
    return [];
  }

  return Object.entries(changes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([field, value]) => ({ field, value }));
}

/**
 * Renders a delta value as a readable string.
 *
 * A string is shown as it is, a number or a boolean as its literal, an
 * empty value as an em dash, and anything else as JSON — so a nested object
 * is still readable when the caller does not render it field by field.
 */
export function formatDeltaValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null || value === undefined) {
    return '—';
  }

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** `true` when the value is a plain object (and not an array). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** What the app could read out of the payload of a `MERGE` proposal. */
export type MergeTarget =
  | {
      /** The payload names a surviving node. */
      readonly kind: 'node';
      /** The id of the node that survives the merge. */
      readonly mergeIntoNodeId: string;
    }
  | {
      /** The payload does not name a surviving node. */
      readonly kind: 'invalid';
      /** Why the payload could not be read. */
      readonly reason: string;
    };

/**
 * Reads the surviving node of a `MERGE` proposal.
 *
 * The payload is JSONB: it is narrowed with the shared Zod schema, and a
 * payload that does not match is reported instead of being guessed at.
 */
export function readMergeTarget(proposedChanges: Record<string, unknown>): MergeTarget {
  const parsed = MergeProposalChangesSchema.safeParse(proposedChanges);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      kind: 'invalid',
      reason:
        issue === undefined
          ? 'The payload does not name a surviving node.'
          : `${issue.path.join('.') || 'mergeIntoNodeId'}: ${issue.message}`
    };
  }

  return { kind: 'node', mergeIntoNodeId: parsed.data.mergeIntoNodeId };
}
