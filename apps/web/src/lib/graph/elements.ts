/**
 * The mapping from the DTOs to the Cytoscape elements.
 *
 * Pure: no DOM, no Cytoscape instance, no API call. The colours are derived
 * from the **status** the API sent — the client never invents a state, it
 * only paints the one it was given.
 */

import type { EdgeStatus, NodeDto, NodeStatus, SubgraphEdgeDto } from '$lib/api/types';
import type { StylesheetJson } from 'cytoscape';

/** The element of a node, ready for `cy.add()`. */
export interface GraphNodeElement {
  group: 'nodes';
  data: {
    id: string;
    label: string;
    typeKey: string;
    status: string;
    color: string;
  };
}

/** The element of a relation, ready for `cy.add()`. */
export interface GraphEdgeElement {
  group: 'edges';
  data: {
    id: string;
    source: string;
    target: string;
    label: string;
    status: string;
    color: string;
  };
}

/** Any element of the graph. */
export type GraphElement = GraphNodeElement | GraphEdgeElement;

/** The colour of a node, by its status. */
const NODE_COLORS: Record<NodeStatus, string> = {
  ACTIVE: '#15803d',
  PENDING: '#b45309',
  DRAFT: '#64748b',
  MERGED: '#6d28d9',
  DEPRECATED: '#94a3b8',
  REJECTED: '#b91c1c'
};

/** The colour of a relation, by its status. */
const EDGE_COLORS: Record<EdgeStatus, string> = {
  ACTIVE: '#475569',
  PENDING: '#b45309',
  DRAFT: '#64748b',
  REJECTED: '#b91c1c'
};

/** The colour of a node of an unknown status. */
const FALLBACK_COLOR = '#64748b';

/** The colour of a node, by its status. */
export function nodeColor(status: NodeStatus): string {
  return NODE_COLORS[status] ?? FALLBACK_COLOR;
}

/** The colour of a relation, by its status. */
export function edgeColor(status: EdgeStatus): string {
  return EDGE_COLORS[status] ?? FALLBACK_COLOR;
}

/** The element of one node. */
export function toNodeElement(node: NodeDto): GraphNodeElement {
  return {
    group: 'nodes',
    data: {
      id: node.id,
      label: node.title,
      typeKey: node.typeKey,
      status: node.status,
      color: nodeColor(node.status)
    }
  };
}

/** The element of one relation. */
export function toEdgeElement(edge: SubgraphEdgeDto): GraphEdgeElement {
  return {
    group: 'edges',
    data: {
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      label: edge.relationKey,
      status: edge.status,
      color: edgeColor(edge.status)
    }
  };
}

/** The elements of a subgraph: the nodes first, then the relations. */
export function toGraphElements(
  nodes: readonly NodeDto[],
  edges: readonly SubgraphEdgeDto[]
): GraphElement[] {
  return [...nodes.map(toNodeElement), ...edges.map(toEdgeElement)];
}

/**
 * The stylesheet of the canvas.
 *
 * The relations are styled by their **relation key** (the label) and their
 * **status** (the colour and the dash pattern): a `PENDING` relation is
 * drawn dashed, an `ACTIVE` one solid.
 */
export const GRAPH_STYLESHEET: StylesheetJson = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'background-color': 'data(color)',
      color: '#0f172a',
      'font-size': '10px',
      'text-valign': 'bottom',
      'text-margin-y': 4,
      'text-wrap': 'ellipsis',
      'text-max-width': '120px',
      width: '28px',
      height: '28px',
      'border-width': '1px',
      'border-color': '#ffffff',
      'overlay-opacity': 0
    }
  },
  {
    selector: 'node.vozlab-selected',
    style: {
      'border-width': '3px',
      'border-color': '#1e3a8a',
      'overlay-color': '#1e3a8a',
      'overlay-opacity': 0.12,
      'overlay-padding': '6px'
    }
  },
  {
    selector: 'edge',
    style: {
      label: 'data(label)',
      'line-color': 'data(color)',
      'target-arrow-color': 'data(color)',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      width: '1.5px',
      'font-size': '8px',
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.75,
      'text-background-padding': '2px',
      'text-rotation': 'autorotate'
    }
  },
  {
    selector: 'edge[status = "PENDING"]',
    style: {
      'line-style': 'dashed'
    }
  },
  {
    selector: 'edge[status = "REJECTED"]',
    style: {
      'line-style': 'dotted'
    }
  }
];
