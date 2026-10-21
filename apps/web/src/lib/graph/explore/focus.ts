/**
 * The **focus** of the exploration view: which node the view presents.
 *
 * The exploration view has no root and no central node the user has to pick
 * first: it *presents* a node and the criterion is the user's choice. The
 * three criteria are:
 *
 * - `recent`: the most recently **added** node of the window;
 * - `related`: the node with the **most relations** inside the window;
 * - `manual`: the node the user last clicked.
 *
 * Pure: no DOM, no Cytoscape, no API call. The view reads the DTOs and
 * renders what these functions answer.
 */

import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';

/** The criterion that decides which node the view presents. */
export type FocusCriterion = 'recent' | 'related' | 'manual';

/** Every criterion, in the order the control shows them. */
export const FOCUS_CRITERIA: readonly FocusCriterion[] = ['recent', 'related', 'manual'];

/**
 * How many relations each node has **inside the window**.
 *
 * A relation counts once for each of its two ends: a relation between two
 * nodes of the window is one relation of each of them.
 */
export function relationCounts(edges: readonly SubgraphEdgeDto[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const edge of edges) {
    counts.set(edge.sourceNodeId, (counts.get(edge.sourceNodeId) ?? 0) + 1);
    counts.set(edge.targetNodeId, (counts.get(edge.targetNodeId) ?? 0) + 1);
  }

  return counts;
}

/**
 * The instant a node was created.
 *
 * `createdAt` is an ISO-8601 instant; a value that cannot be read is the
 * oldest possible one, so a node with a broken date never wins the
 * "newest" criterion by accident.
 */
function createdAt(node: NodeDto): number {
  const time = Date.parse(node.createdAt);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * The most recently **added** node of the window.
 *
 * The tie is broken by the id, exactly the way the API orders the window
 * (`createdAt DESC, id DESC`): two nodes created in the same instant have a
 * deterministic winner.
 */
export function newestNode(nodes: readonly NodeDto[]): NodeDto | null {
  let best: NodeDto | null = null;

  for (const node of nodes) {
    if (best === null) {
      best = node;
      continue;
    }

    const time = createdAt(node);
    const bestTime = createdAt(best);

    if (time > bestTime || (time === bestTime && node.id > best.id)) {
      best = node;
    }
  }

  return best;
}

/**
 * The node with the **most relations** inside the window.
 *
 * The tie is broken by the order of the window (the newest first), so the
 * answer is deterministic. A node without relations has zero; when no node
 * has any, the newest one is presented instead of nothing.
 */
export function mostRelatedNode(
  nodes: readonly NodeDto[],
  edges: readonly SubgraphEdgeDto[]
): NodeDto | null {
  const counts = relationCounts(edges);
  let best: NodeDto | null = null;
  let bestCount = -1;

  for (const node of nodes) {
    const count = counts.get(node.id) ?? 0;

    if (count > bestCount) {
      best = node;
      bestCount = count;
    }
  }

  return bestCount > 0 ? best : newestNode(nodes);
}

/**
 * The node the view presents.
 *
 * With `manual` and no click yet, the **related** node is presented: the
 * view never shows nothing while it has nodes to show.
 */
export function presentedNodeId(
  nodes: readonly NodeDto[],
  edges: readonly SubgraphEdgeDto[],
  criterion: FocusCriterion,
  manualNodeId: string | null
): string | null {
  if (nodes.length === 0) {
    return null;
  }

  if (criterion === 'manual') {
    const manual =
      manualNodeId === null ? undefined : nodes.find((node) => node.id === manualNodeId);

    if (manual !== undefined) {
      return manual.id;
    }

    return mostRelatedNode(nodes, edges)?.id ?? null;
  }

  if (criterion === 'recent') {
    return newestNode(nodes)?.id ?? null;
  }

  return mostRelatedNode(nodes, edges)?.id ?? null;
}
