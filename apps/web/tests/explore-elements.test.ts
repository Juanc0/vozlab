/**
 * The elements of the canvas — the **card** of a node and the text that
 * hangs under it.
 *
 * The card is a surface and the status is a mark on it: the tests check
 * that the card is white, that the default status wears no mark at all and
 * that the type of the node is written in the meta line under the title.
 */

import { describe, expect, it } from 'vitest';
import type { SubgraphEdgeDto } from '$lib/api/types';
import {
  CARD_CLASS,
  CARD_COLOR,
  CARD_META_INK,
  EXPANDED_CLASS,
  META_CLASS,
  BODY_CLASS,
  nodeCardContent,
  nodeStatusBorder,
  toGraphElements,
  toNodeElement,
  toNodeElements,
  type GraphEdgeElement,
  type GraphNodeElement,
  type GraphTextElement
} from '$lib/graph/elements';
import { CARD_PADDING_X, META_LINE_HEIGHT, TITLE_LINE_HEIGHT } from '$lib/graph/node-card';
import { statusLabel } from '$lib/i18n/statuses';
import { EDGE, NODE_A, NODE_B, NODE_C, PROBLEM_NAMES } from './fixtures/graph';

/**
 * A deterministic measurer: every glyph is six pixels wide.
 *
 * The measurer is injected, so the size of the card does not depend on the
 * font of the machine that runs the test.
 */
const measure = (text: string): number => text.length * 6;

describe('the card of a node', () => {
  it('carries the title, and the title is the label of the card', () => {
    const element = toNodeElement(NODE_A, { measure });

    expect(element.data.label).toBe('The campus shuttle\nleaves every hour');
  });

  it('does not carry the description and the attributes when it is not expanded', () => {
    const element = toNodeElement(NODE_A, { measure });

    expect(element.data.label).not.toContain('runbook');
    expect(element.data.expanded).toBe(false);
  });

  it('carries the description and the attributes in its body when it is expanded', () => {
    const body = toNodeElements(NODE_A, { expanded: true, measure }).find(
      (element) => element.group === 'nodes' && element.classes?.includes(BODY_CLASS)
    ) as GraphTextElement;

    // The body is the description and the attributes, broken into lines,
    // but never into words.
    const unwrapped = body.data.label.split('\n').join(' ');

    expect(unwrapped).toContain(NODE_A.description ?? '');
    expect(unwrapped).toContain('source');
    expect(unwrapped).toContain('runbook');
    expect(body.classes).toContain(BODY_CLASS);
  });

  it('says so when the node has no description', () => {
    const content = nodeCardContent(NODE_B, { expanded: true });

    expect(content.title).toBe(NODE_B.title);
    expect(content.body).not.toContain('undefined');
  });

  it('writes the values of the attributes that are not texts', () => {
    const content = nodeCardContent(
      { ...NODE_A, attributes: { count: 3, done: true, tags: ['a'] } },
      { expanded: true }
    );

    expect(content.body).toContain('count: 3');
    expect(content.body).toContain('done: true');
    expect(content.body).toContain('tags: ["a"]');
  });

  it('has no body when the card is not expanded', () => {
    expect(nodeCardContent(NODE_A).body).toBe('');
  });
});

describe('the meta line of a card', () => {
  it('is the type of the node, under the title', () => {
    const [, meta] = toNodeElements(NODE_A, { measure, locale: 'es' }) as [
      GraphNodeElement,
      GraphTextElement
    ];

    expect(meta.data.label).toBe(PROBLEM_NAMES.es);
    expect(meta.classes).toContain(META_CLASS);
  });

  it('is the **display name** of the class, in the language of the interface', () => {
    const [, meta] = toNodeElements(NODE_A, {
      measure,
      locale: 'es'
    }) as [GraphNodeElement, GraphTextElement];

    expect(meta.data.label).toBe('Problema');
  });

  it('is the display name of the class in the language the reader chose', () => {
    const [, meta] = toNodeElements(NODE_A, {
      measure,
      locale: 'en'
    }) as [GraphNodeElement, GraphTextElement];

    expect(meta.data.label).toBe('Problem');
  });

  it('keeps the status of the node when the card is expanded', () => {
    const [, meta] = toNodeElements(NODE_A, { expanded: true, measure, locale: 'es' }) as [
      GraphNodeElement,
      GraphTextElement
    ];

    expect(meta.data.label).toBe(`${PROBLEM_NAMES.es} · ${statusLabel('es', 'node', NODE_A.status)}`);
  });

  it('hangs under the card it belongs to', () => {
    const [card, meta] = toNodeElements(NODE_A, { measure }) as [
      GraphNodeElement,
      GraphTextElement
    ];

    expect(meta.data.cardId).toBe(card.data.id);
  });
});

describe('the mark of the status', () => {
  it('wears a soft brand edge when the node is active', () => {
    const border = nodeStatusBorder('ACTIVE');

    expect(border.width).toBe(1);
    expect(border.color).toBe('#99c0f6');
  });

  it('is a border of two pixels in the colour of the status', () => {
    expect(nodeStatusBorder('PENDING')).toEqual({ width: 2, color: '#6d5fa3' });
    expect(nodeStatusBorder('REJECTED')).toEqual({ width: 2, color: '#c4242a' });
    expect(nodeStatusBorder('MERGED')).toEqual({ width: 2, color: CARD_META_INK });
  });

  it('is on the card, and the card is white', () => {
    const element = toNodeElement(NODE_B, { measure });

    expect(element.data.borderWidth).toBe(2);
    expect(element.data.borderColor).toBe('#6d5fa3');
    expect(CARD_COLOR).toBe('#ffffff');
  });
});

describe('the size of the card of a node', () => {
  it('is in the data of the element', () => {
    const element = toNodeElement(NODE_A, { measure });

    // The title of the node is thirty-four characters: two lines of twenty.
    expect(element.data.width).toBe(140);
    expect(element.data.innerWidth).toBe(140 - CARD_PADDING_X * 2);
    expect(element.data.height).toBe(2 * TITLE_LINE_HEIGHT + 12 + META_LINE_HEIGHT);
  });

  it('is the size of the text it holds', () => {
    const element = toNodeElement(NODE_A, { measure });

    // The label carries the line breaks of the title: the number of the
    // lines of the label is the number of the lines of the card.
    expect(element.data.label).toBe('The campus shuttle\nleaves every hour');
    expect(element.data.label.split('\n')).toHaveLength(2);
  });

  it('grows with the number of lines', () => {
    const short = toNodeElement(NODE_B, { measure });
    const long = toNodeElement(
      {
        ...NODE_A,
        title: 'La avenida principal no tiene ciclovía y los ciclistas compiten con los buses'
      },
      { measure }
    );

    expect(long.data.height).toBeGreaterThan(short.data.height);
    expect(long.data.label.split('\n').length).toBeGreaterThan(
      short.data.label.split('\n').length
    );
  });
});

describe('the elements of the exploration window', () => {
  it('marks the expanded nodes and leaves the others alone', () => {
    const elements = toGraphElements([NODE_A, NODE_B], [], {
      expandedIds: new Set([NODE_B.id]),
      measure
    });

    const cards = elements.filter(
      (element) => element.group === 'nodes' && !('cardId' in element.data)
    ) as GraphNodeElement[];

    expect(cards[0]?.data.expanded).toBe(false);
    expect(cards[0]?.classes).toContain(CARD_CLASS);
    expect(cards[0]?.classes).not.toContain(EXPANDED_CLASS);
    expect(cards[1]?.data.expanded).toBe(true);
    expect(cards[1]?.classes).toContain(EXPANDED_CLASS);
  });

  it('gives every node the size of its own card', () => {
    const elements = toGraphElements([NODE_A, NODE_B], [], { measure });

    for (const element of elements) {
      if (element.group !== 'nodes' || 'cardId' in element.data) {
        continue;
      }

      const card = element as GraphNodeElement;

      expect(card.data.width).toBeGreaterThan(0);
      expect(card.data.height).toBeGreaterThan(0);
      expect(card.data.innerWidth).toBeLessThan(card.data.width);
    }
  });

  it('writes the name of the type in the language of the interface', () => {
    const elements = toGraphElements([NODE_A], [], {
      measure,
      locale: 'es'
    }) as GraphTextElement[];

    const meta = elements.find((element) => element.classes?.includes(META_CLASS));

    expect(meta?.data.label).toBe('Problema');
  });

  it('keeps the key of a type that the ontology does not know', () => {
    const elements = toGraphElements([NODE_C], [], {
      measure,
      locale: 'es'
    }) as GraphTextElement[];

    const meta = elements.find((element) => element.classes?.includes(META_CLASS));

    expect(meta?.data.label).toBe('Task');
  });

  it('writes the name of the relation in the language of the interface', () => {
    const elements = toGraphElements([NODE_A, NODE_B], [EDGE], {
      measure,
      locale: 'es'
    }) as GraphEdgeElement[];

    const edge = elements.find((element) => element.group === 'edges');

    expect(edge?.data.label).toBe('Sugiere');
  });

  it('never paints the key of the system as the label of a relation', () => {
    // The seeded ontology: the relation is `RELATES_TO` and its display
    // name is "Se relaciona con".
    const seeded: SubgraphEdgeDto = {
      ...EDGE,
      relationKey: 'RELATES_TO',
      relationDisplayNames: { en: 'Relates to', es: 'Se relaciona con' }
    };

    const elements = toGraphElements([NODE_A, NODE_B], [seeded], {
      measure,
      locale: 'es'
    }) as GraphEdgeElement[];

    const edge = elements.find((element) => element.group === 'edges');

    expect(edge?.data.label).toBe('Se relaciona con');
    expect(edge?.data.label).not.toBe('RELATES_TO');
  });

  it('paints the name of the relation in the language the reader chose', () => {
    const seeded: SubgraphEdgeDto = {
      ...EDGE,
      relationKey: 'RELATES_TO',
      relationDisplayNames: { en: 'Relates to', es: 'Se relaciona con' }
    };

    const elements = toGraphElements([NODE_A, NODE_B], [seeded], {
      measure,
      locale: 'en'
    }) as GraphEdgeElement[];

    const edge = elements.find((element) => element.group === 'edges');

    expect(edge?.data.label).toBe('Relates to');
  });
});
