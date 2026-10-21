/**
 * What the inspector shows.
 *
 * The selection is a **union**: a node or a relation, and never a kind
 * without an id. The canvas selects nodes; the list view selects nodes
 * *and* relations; both report the same shape, so the inspector does not
 * care where the selection came from.
 *
 * The module is pure: the type, the two constructors and the comparisons the
 * page and the views need. Nothing here knows how to read anything.
 */

import type { TargetType } from '$lib/api/types';

/** The thing the inspector shows. */
export type InspectorSelection =
  | { readonly kind: 'node'; readonly id: string }
  | { readonly kind: 'edge'; readonly id: string };

/** The selection of a node. */
export function nodeSelection(id: string): InspectorSelection {
  return { kind: 'node', id };
}

/** The selection of a relation. */
export function edgeSelection(id: string): InspectorSelection {
  return { kind: 'edge', id };
}

/** `true` when the two selections point at the same thing. */
export function isSameSelection(
  left: InspectorSelection | null,
  right: InspectorSelection | null
): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return left.kind === right.kind && left.id === right.id;
}

/**
 * The kind of target the API expects for a selection.
 *
 * The proposals API takes a `TargetType` (`NODE`, `EDGE`, `ONTOLOGY`) and
 * the discussions API takes a `DiscussionTargetType` — the node and the
 * relation are common to both, so one answer serves the two.
 */
export function selectionTargetType(selection: InspectorSelection): TargetType {
  return selection.kind === 'node' ? 'NODE' : 'EDGE';
}
