/**
 * The **picture** of the exploration view.
 *
 * The picture is the **working set**: the window the view started from and
 * every neighbourhood the reader has walked to. Everything that has been on
 * the picture stays on it — what has been seen is never lost, and the
 * reader cannot take a node away from the picture.
 *
 * The relations of the picture are the ones whose **two ends** are in it: a
 * relation with one end outside would be a line that goes nowhere.
 *
 * Pure: no DOM, no Cytoscape, no API call.
 */

import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';

/** The nodes and the relations of a picture. */
export interface Neighbourhood {
  /** The nodes of the picture. */
  readonly nodes: NodeDto[];
  /** The relations among the nodes of the picture. */
  readonly edges: SubgraphEdgeDto[];
}

/**
 * The picture of a working set.
 *
 * The nodes are the ones of the working set, and the relations are the ones
 * whose two ends are among them.
 *
 * @param nodes - The nodes of the working set.
 * @param edges - The relations of the working set.
 * @returns The picture the canvas draws.
 */
export function pictureOf(
  nodes: readonly NodeDto[],
  edges: readonly SubgraphEdgeDto[]
): Neighbourhood {
  const ids = new Set(nodes.map((node) => node.id));

  return {
    nodes: [...nodes],
    edges: edges.filter((edge) => ids.has(edge.sourceNodeId) && ids.has(edge.targetNodeId))
  };
}
