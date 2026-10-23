/**
 * The stylesheet of the **exploration view**.
 *
 * It is the stylesheet of the subgraph with two differences: the node the
 * user selected wears a halo of its own and the node the view presents wears
 * a ring of its own, so the selection and the focus of the view are visible
 * at a glance.
 *
 * Every node is a **card**: a rectangle with the radius of the design
 * system, filled with the surface of the interface, with the title wrapped
 * inside it and the type of the node under it.
 */

import type { StylesheetJson } from 'cytoscape';
import {
  BODY_CLASS,
  CARD_CLASS,
  CARD_META_INK,
  CARD_NODE_STYLE,
  CARD_TEXT_STYLE,
  GROUND_COLOR,
  META_CLASS,
  PRESENTED_COLOR,
  RELATION_CARD_CLASS,
  RELATION_CARD_NODE_STYLE,
  SELECTION_COLOR
} from '../elements';

/** The class of the node the user selected. */
export const SELECTED_CLASS = 'vozlab-selected';

/** The class of the node the view presents. */
export const PRESENTED_CLASS = 'vozlab-presented';

/** The stylesheet of the exploration view. */
export const EXPLORE_STYLESHEET: StylesheetJson = [
  {
    selector: `node.${CARD_CLASS}`,
    style: CARD_NODE_STYLE
  },
  {
    // The card of a relation: a card of the design system, with a border of
    // one pixel — it is not a node of the window.
    selector: `node.${RELATION_CARD_CLASS}`,
    style: RELATION_CARD_NODE_STYLE
  },
  {
    selector: `node.${META_CLASS}`,
    style: { ...CARD_TEXT_STYLE, color: CARD_META_INK }
  },
  {
    selector: `node.${BODY_CLASS}`,
    style: CARD_TEXT_STYLE
  },
  {
    // The selection is a halo **behind** the card: an overlay would be
    // painted on top of it and would tint the card and its text.
    selector: `node.${SELECTED_CLASS}`,
    style: {
      'border-width': '3px',
      'border-color': SELECTION_COLOR,
      'underlay-color': SELECTION_COLOR,
      'underlay-opacity': 0.12,
      'underlay-padding': '6px'
    }
  },
  {
    // The node the view presents wears a ring of its own.
    //
    // The ring is the **ink**, and not a colour of the status: it says
    // "this is the one the view is showing you", which is a fact about the
    // view and not a state of the node. The ring is an outline, so it never
    // fights with the border of the status.
    selector: `node.${PRESENTED_CLASS}`,
    style: {
      'outline-width': '3px',
      'outline-color': PRESENTED_COLOR
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
      // The arrow is a relation: it has to be seen. A line thinner than two
      // pixels disappears on a dense picture, and its triangle with it.
      width: '2px',
      // The relation's name is a phrase, not a key: it has to be read at
      // a glance, so it is set at the small size and not smaller.
      'font-size': '11px',
      // The name of a relation is a secondary text: it is written in the
      // muted ink, not in the full one.
      color: CARD_META_INK,
      // The name of a relation sits on the **ground** of the canvas, on an
      // **opaque** plate: the line of the relation must not show through
      // the name that names it.
      'text-background-color': GROUND_COLOR,
      'text-background-opacity': 1,
      'text-background-padding': '2px',
      'text-rotation': 'autorotate',
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
