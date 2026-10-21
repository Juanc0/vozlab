/**
 * The stylesheet of the **exploration view**.
 *
 * It is the stylesheet of the subgraph with two differences: a node that is
 * expanded is drawn as a **card** — a rectangle with the content of the
 * node — and the node that is presented wears a ring of its own, so the
 * focus of the view is visible at a glance.
 */

import type { StylesheetJson } from 'cytoscape';
import { EXPANDED_CLASS, NODE_CARD_HEIGHT, NODE_CARD_WIDTH, NODE_DOT_SIZE } from '../elements';

/** The class of the node the user selected. */
export const SELECTED_CLASS = 'vozlab-selected';

/** The class of the node the view presents. */
export const PRESENTED_CLASS = 'vozlab-presented';

/** The stylesheet of the exploration view. */
export const EXPLORE_STYLESHEET: StylesheetJson = [
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
      width: NODE_DOT_SIZE,
      height: NODE_DOT_SIZE,
      'border-width': '1px',
      'border-color': '#ffffff',
      'overlay-opacity': 0
    }
  },
  {
    // The card: the node grows and shows its whole content.
    selector: `node.${EXPANDED_CLASS}`,
    style: {
      shape: 'round-rectangle',
      width: NODE_CARD_WIDTH,
      height: NODE_CARD_HEIGHT,
      'background-color': '#ffffff',
      'border-width': '1px',
      'border-color': '#94a3b8',
      'text-valign': 'center',
      'text-halign': 'center',
      'text-margin-y': 0,
      'text-wrap': 'wrap',
      'text-max-width': `${NODE_CARD_WIDTH - 24}px`,
      'font-size': '10px',
      'line-height': 1.35,
      color: '#0f172a'
    }
  },
  {
    // The selection is a halo **behind** the node: an overlay would be
    // painted on top of it and would tint the card and its text.
    selector: `node.${SELECTED_CLASS}`,
    style: {
      'border-width': '3px',
      'border-color': '#1e3a8a',
      'underlay-color': '#1e3a8a',
      'underlay-opacity': 0.12,
      'underlay-padding': '6px'
    }
  },
  {
    // The node the view presents wears a ring of its own.
    selector: `node.${PRESENTED_CLASS}`,
    style: {
      'border-width': '3px',
      'border-color': '#b45309'
    }
  },
  {
    selector: 'edge',
    style: {
      label: 'data(label)',
      'line-color': 'data(color)',
      'target-arrow-color': 'data(color)',
      'target-arrow-shape': 'triangle',
      width: '1.5px',
      'font-size': '8px',
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.75,
      'text-background-padding': '2px',
      'text-rotation': 'autorotate',
      // The haystack shape is the exaggerated one: the arc it draws has to
      // be seen, not guessed. The radius is a **fraction** of the size of
      // the node, not a number of pixels: Cytoscape refuses anything that
      // is not between zero and one.
      'haystack-radius': 1,
      'overlay-opacity': 0
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
