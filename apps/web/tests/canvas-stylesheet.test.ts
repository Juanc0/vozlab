/**
 * The **stylesheet of the canvas** (roadmap batch 3.16).
 *
 * The stylesheet is the contract of the marks: the card is a surface, the
 * status is a border of two pixels, the selection is the accent with its
 * pale underlay, and the node the view presents wears a ring in the ink.
 *
 * A test that reads the stylesheet is a test of the *contract*, not of the
 * rendering: it is what stops a later batch from painting a card in the
 * colour of its status again.
 */

import { describe, expect, it } from 'vitest';
import { CARD_CLASS, GRAPH_STYLESHEET, META_CLASS } from '$lib/graph/elements';
import {
  EXPLORE_STYLESHEET,
  PRESENTED_CLASS,
  SELECTED_CLASS
} from '$lib/graph/explore/stylesheet';
import type { StylesheetJson } from 'cytoscape';

/** The rule of a stylesheet, by its selector. */
function rule(
  stylesheet: StylesheetJson,
  selector: string
): Record<string, unknown> | undefined {
  const block = stylesheet.find(
    (entry) => 'selector' in entry && entry.selector === selector
  );

  return block !== undefined && 'style' in block
    ? (block.style as unknown as Record<string, unknown>)
    : undefined;
}

describe('the marks of the canvas', () => {
  it('paints the card as a surface, with no edge of its own', () => {
    const card = rule(GRAPH_STYLESHEET, `node.${CARD_CLASS}`);

    expect(card?.['background-color']).toBe('#ffffff');
    // The edge of the card is the mark of the status — and nothing else.
    expect(card?.['border-width']).toBe('data(borderWidth)');
    expect(card?.['border-color']).toBe('data(borderColor)');
  });

  it('writes the meta line in the muted ink', () => {
    const meta = rule(GRAPH_STYLESHEET, `node.${META_CLASS}`);

    expect(meta?.['color']).toBe('#5f6672');
  });

  it('gives the selection the accent and its pale underlay', () => {
    const selected = rule(EXPLORE_STYLESHEET, `node.${SELECTED_CLASS}`);

    expect(selected?.['border-color']).toBe('#2563eb');
    expect(selected?.['underlay-color']).toBe('#2563eb');
    expect(selected?.['underlay-opacity']).toBe(0.12);
  });

  it('gives the node the view presents a ring in the ink', () => {
    const presented = rule(EXPLORE_STYLESHEET, `node.${PRESENTED_CLASS}`);

    // The ring is the ink and not a colour of the status: it says "this is
    // the one the view is showing you", which is not a state of the node.
    expect(presented?.['outline-color']).toBe('#111827');
    expect(presented?.['outline-width']).toBe('3px');
  });
});
