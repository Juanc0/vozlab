/**
 * The **spacing** of the layout of the canvas.
 *
 * The separations of the layout are the room the cards need: the gap
 * between two cards, and the room a relation and its label need between two
 * columns. They are small on purpose — every pixel of gap is a pixel the
 * reader does not see at the readable zoom.
 *
 * The card holds its own text: the title, the meta line and the body are
 * all inside its rectangle, so the layout reserves the whole of it and the
 * gap between two cards never has to hold the meta line.
 */

import { describe, expect, it, vi } from 'vitest';

/**
 * Cytoscape needs a `<canvas>`, which jsdom does not provide. The module is
 * mocked instead: the point of the test is the **spacing**, not the drawing.
 */
vi.mock('cytoscape', () => ({ default: Object.assign(vi.fn(), { use: vi.fn() }) }));

const { DAGRE_LAYOUT } = await import('$lib/graph/cytoscape');

describe('the layout of the canvas', () => {
  it('is deterministic: dagre, never a physics simulation', () => {
    expect(DAGRE_LAYOUT.name).toBe('dagre');
    expect(DAGRE_LAYOUT.animate).toBe(false);
  });

  it('keeps the gap between two cards small', () => {
    // The gap between two cards is only the air they need: the card holds
    // its own text, so the gap does not have to hold the meta line.
    expect(DAGRE_LAYOUT.nodeSep).toBeGreaterThanOrEqual(40);
    expect(DAGRE_LAYOUT.nodeSep).toBeLessThanOrEqual(60);
  });

  it('keeps the room of a relation and its label between two columns', () => {
    expect(DAGRE_LAYOUT.rankSep).toBeGreaterThanOrEqual(60);
    expect(DAGRE_LAYOUT.rankSep).toBeLessThanOrEqual(120);
    expect(DAGRE_LAYOUT.edgeSep).toBeGreaterThan(0);
  });

  it('has no spacing factor: the picture is not inflated around its centre', () => {
    // `spacingFactor` is not a knob of `dagre`: Cytoscape's core applies it
    // by pushing every node away from the centre of the picture. It only
    // makes the picture bigger, and the separations are the only knob the
    // layout needs.
    expect(DAGRE_LAYOUT.spacingFactor).toBeUndefined();
  });
});
