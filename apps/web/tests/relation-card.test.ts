/**
 * The **card of a relation** — its name, its attributes, its author and its
 * dates, and the place it is drawn in.
 *
 * The card is the answer to the question "what is this relation?": the
 * window carries the content of a relation, and the card shows it. The
 * collapsed relation is still the label on the line, and the expanded one is
 * a card that does not cover the nodes it connects.
 */

import { describe, expect, it } from 'vitest';
import {
  BODY_CLASS,
  META_CLASS,
  RELATION_CARD_CLASS,
  relationIdOf,
  toEdgeElement,
  toGraphElements,
  toRelationCardElements,
  type GraphNodeElement,
  type GraphTextElement
} from '$lib/graph/elements';
import {
  relationCardContent,
  relationCardPlacement,
  shortPseudonym
} from '$lib/graph/relation-card';
import { EDGE, EDGE_B, NODE_A, NODE_B, RELATION_NAMES } from './fixtures/graph';

/**
 * A deterministic measurer: every glyph is six pixels wide.
 *
 * The measurer is injected, so the size of the card does not depend on the
 * font of the machine that runs the test.
 */
const measure = (text: string): number => text.length * 6;

describe('the content of the card of a relation', () => {
  it('is the name of the relation, in the language of the interface', () => {
    const content = relationCardContent(EDGE, { locale: 'es' });

    expect(content.title).toBe(RELATION_NAMES.SUGGESTS.es);
  });

  it('carries the attributes as key/value rows, in the format of the node', () => {
    const content = relationCardContent(EDGE, { locale: 'es' });

    expect(content.body).toContain('weight: 3');
    expect(content.body).toContain('source: runbook');
  });

  it('carries the author and the date of the relation', () => {
    const content = relationCardContent(EDGE, { locale: 'es' });

    // The author is the **pseudonym**: the card never carries an identity,
    // an email or a user id.
    expect(content.body).toContain('Autoría: cccccccc…');
    expect(content.body).not.toContain(EDGE.authorHash);

    expect(content.body).toContain('Creado:');
  });

  it('carries the status and the score of the relation in its meta line', () => {
    const content = relationCardContent(EDGE, { locale: 'es' });

    expect(content.meta).toBe('Activo · 3');
  });

  it('is never empty: a relation without attributes still shows its author', () => {
    const content = relationCardContent(EDGE_B, { locale: 'es' });

    expect(content.body).toContain('Autoría:');
    expect(content.body).toContain('Creado:');
  });

  it('shortens the pseudonym and never loses it', () => {
    expect(shortPseudonym('a'.repeat(64))).toBe('aaaaaaaa…');
    expect(shortPseudonym('abc')).toBe('abc');
  });
});

describe('the relation on the picture', () => {
  it('is the label on the line when it is not expanded', () => {
    const element = toEdgeElement(EDGE, { locale: 'es' });

    expect(element.data.label).toBe(RELATION_NAMES.SUGGESTS.es);
    expect(element.data.expanded).toBe(false);
  });

  it('gives its name to the card when it is expanded, and leaves the line bare', () => {
    const element = toEdgeElement(EDGE, { locale: 'es', expanded: true });

    expect(element.data.label).toBe('');
    expect(element.data.expanded).toBe(true);
  });
});

describe('the elements of the card of a relation', () => {
  it('are the card and the two lines of text that hang under it', () => {
    const elements = toRelationCardElements(EDGE, { measure, locale: 'es' });

    const card = elements[0] as GraphNodeElement;
    const meta = elements[1] as GraphTextElement;
    const body = elements[2] as GraphTextElement;

    // The card carries the name of the relation.
    expect(card.data.label).toBe(RELATION_NAMES.SUGGESTS.es);
    expect(card.classes).toContain(RELATION_CARD_CLASS);
    expect(card.data.width).toBeGreaterThan(0);
    expect(card.data.height).toBeGreaterThan(0);

    // The meta line and the body hang under the card.
    expect(meta.classes).toContain(META_CLASS);
    expect(meta.data.cardId).toBe(card.data.id);
    expect(body.classes).toContain(BODY_CLASS);
    expect(body.data.cardId).toBe(card.data.id);

    // And they carry the content of the relation.
    expect(meta.data.label).toContain('Activo');
    expect(body.data.label).toContain('weight: 3');
    expect(body.data.label).toContain('Autoría:');
  });

  it('are the elements of the graph when the relation is expanded', () => {
    const collapsed = toGraphElements([NODE_A, NODE_B], [EDGE], { measure });
    const expanded = toGraphElements([NODE_A, NODE_B], [EDGE], {
      measure,
      expandedEdgeIds: new Set([EDGE.id])
    });

    const cardsOf = (elements: ReturnType<typeof toGraphElements>) =>
      elements.filter(
        (element) =>
          element.group === 'nodes' && element.classes?.includes(RELATION_CARD_CLASS)
      );

    expect(cardsOf(collapsed)).toHaveLength(0);
    expect(cardsOf(expanded)).toHaveLength(1);
  });

  it('know the relation they belong to', () => {
    const [card] = toRelationCardElements(EDGE, { measure });

    // The element as Cytoscape answers it: the card knows the id of the
    // relation it is the card of.
    const element = {
      id: () => card.data.id,
      data: (key: string) => (card.data as Record<string, unknown>)[key]
    };

    expect(relationIdOf(element as never)).toBe(EDGE.id);
  });
});

describe('the place of the card of a relation', () => {
  it('is beside the line and not on it', () => {
    const place = relationCardPlacement(
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { width: 240, height: 80 },
      []
    );

    // The card hangs above (or below) the line: it is never on it.
    expect(place.y).not.toBe(0);
    expect(Math.abs(place.y)).toBeGreaterThan(40);
  });

  it('does not cover the nodes it connects', () => {
    const source = { x: 0, y: 0 };
    const target = { x: 400, y: 0 };
    const card = { width: 240, height: 80 };

    const place = relationCardPlacement(source, target, card, [
      { cx: source.x, cy: source.y, width: 140, height: 60 },
      { cx: target.x, cy: target.y, width: 140, height: 60 }
    ]);

    const left = place.x - card.width / 2;
    const right = place.x + card.width / 2;
    const top = place.y - card.height / 2;
    const bottom = place.y + card.height / 2;

    for (const node of [
      { cx: source.x, cy: source.y, width: 140, height: 60 },
      { cx: target.x, cy: target.y, width: 140, height: 60 }
    ]) {
      const overlaps =
        left < node.cx + node.width / 2 &&
        right > node.cx - node.width / 2 &&
        top < node.cy + node.height / 2 &&
        bottom > node.cy - node.height / 2;

      expect(overlaps).toBe(false);
    }
  });

  it('walks away when the place it chose is occupied', () => {
    const source = { x: 0, y: 0 };
    const target = { x: 400, y: 0 };
    const card = { width: 240, height: 80 };

    const free = relationCardPlacement(source, target, card, []);
    const blocked = relationCardPlacement(source, target, card, [
      { cx: 200, cy: free.y, width: 240, height: 80 }
    ]);

    expect(blocked.y).not.toBe(free.y);
  });
});
