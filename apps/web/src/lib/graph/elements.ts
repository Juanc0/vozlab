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
    /** Whether the node is drawn as a card instead of a dot. */
    expanded: boolean;
  };
  /** The classes of the element — the stylesheet keys on them. */
  classes?: string[];
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

/** The class of a node that is drawn as a card. */
export const EXPANDED_CLASS = 'vozlab-expanded';

/** The size of a node that is drawn as a dot. */
export const NODE_DOT_SIZE = 28;

/** The width of a node that is drawn as a card. */
export const NODE_CARD_WIDTH = 240;

/** The height of a node that is drawn as a card. */
export const NODE_CARD_HEIGHT = 150;

/**
 * Formats the value of an attribute for the card of a node.
 *
 * A value that is not a text is written as JSON: the reader must see what
 * the API sent, not an empty cell.
 */
export function formatAttributeValue(value: unknown): string {
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

/**
 * The text of the **card** of a node.
 *
 * The card carries the whole content of the node: its title, its class and
 * its status, its description and its attributes. It is the difference
 * between a node that is expanded and a node that is a dot.
 */
export function nodeCardText(node: NodeDto): string {
  const lines: string[] = [node.title, `${node.typeKey} · ${node.status}`];

  const description = node.description?.trim() ?? '';

  if (description !== '') {
    lines.push(description);
  }

  for (const [key, value] of Object.entries(node.attributes ?? {})) {
    lines.push(`${key}: ${formatAttributeValue(value)}`);
  }

  return lines.join('\n');
}

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

/** How a node is drawn. */
export interface NodeElementOptions {
  /** Whether the node is drawn as a card instead of a dot. */
  expanded?: boolean;
}

/** The element of one node. */
export function toNodeElement(node: NodeDto, options: NodeElementOptions = {}): GraphNodeElement {
  const expanded = options.expanded === true;

  return {
    group: 'nodes',
    data: {
      id: node.id,
      // The card carries the content of the node; the dot carries its title.
      label: expanded ? nodeCardText(node) : node.title,
      typeKey: node.typeKey,
      status: node.status,
      color: nodeColor(node.status),
      expanded
    },
    ...(expanded ? { classes: [EXPANDED_CLASS] } : {})
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

/** How the elements of a graph are drawn. */
export interface GraphElementOptions {
  /** The nodes that are drawn as a card. */
  expandedIds?: ReadonlySet<string>;
}

/** The elements of a subgraph: the nodes first, then the relations. */
export function toGraphElements(
  nodes: readonly NodeDto[],
  edges: readonly SubgraphEdgeDto[],
  options: GraphElementOptions = {}
): GraphElement[] {
  const expanded = options.expandedIds ?? new Set<string>();

  return [
    ...nodes.map((node) => toNodeElement(node, { expanded: expanded.has(node.id) })),
    ...edges.map(toEdgeElement)
  ];
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
