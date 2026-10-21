/**
 * The **card of a node** (roadmap batch 3.16).
 *
 * The module is pure: the measurer of the text is injected, so the tests
 * measure with a deterministic function and never depend on a font.
 */

import { describe, expect, it } from 'vitest';
import {
  AVERAGE_GLYPH_RATIO,
  CARD_PADDING_X,
  CARD_PADDING_Y,
  CARD_WIDTH,
  META_LINE_HEIGHT,
  TITLE_FONT_SIZE,
  TITLE_LINE_HEIGHT,
  createEstimateMeasurer,
  estimateTextWidth,
  nodeCardSize,
  wrapTitle,
  type TextMeasurer
} from '$lib/graph/node-card';

/**
 * A deterministic measurer: every glyph is six pixels wide.
 *
 * Six pixels is a fair average for the twelve pixels of the title, and it
 * makes the expected numbers of the tests readable.
 */
const measure: TextMeasurer = (text) => text.length * 6;

/** The title of the demo, with eighty characters. */
const SPANISH_TITLE =
  'El transporte interno no alcanza a llegar a tiempo a las aulas del primer turno.';

describe('the wrapping of a title', () => {
  it('never breaks a word', () => {
    const lines = wrapTitle('La ciclovía del campus', 70, measure);

    expect(lines).toEqual(['La ciclovía', 'del campus']);
  });

  it('keeps a word that is longer than the line whole', () => {
    const lines = wrapTitle('antes Estacionamiento después', 70, measure);

    expect(lines).toEqual(['antes', 'Estacionamiento', 'después']);
  });

  it('is greedy: the line is filled with as many words as fit', () => {
    const lines = wrapTitle('uno dos tres cuatro cinco', 78, measure);

    expect(lines).toEqual(['uno dos tres', 'cuatro cinco']);

    // The line is full: the first word of the next one would not fit.
    for (let index = 0; index < lines.length - 1; index += 1) {
      const line = lines[index] as string;
      const next = lines[index + 1] as string;
      const firstWord = next.split(' ')[0] as string;

      expect(measure(`${line} ${firstWord}`)).toBeGreaterThan(78);
    }
  });

  it('wraps every paragraph of a title on its own', () => {
    const lines = wrapTitle('uno dos\ntres cuatro', 78, measure);

    expect(lines).toEqual(['uno dos', 'tres cuatro']);
  });

  it('has no line for a title that is empty', () => {
    expect(wrapTitle('', 100, measure)).toEqual([]);
    expect(wrapTitle('   ', 100, measure)).toEqual([]);
  });
});

describe('the size of a card', () => {
  it('is the width of the card and the height of its text', () => {
    const card = nodeCardSize(SPANISH_TITLE, { measure });

    expect(card.width).toBe(CARD_WIDTH);
    expect(card.lines).toHaveLength(5);
    expect(card.lineCount).toBe(5);
    expect(card.height).toBe(CARD_PADDING_Y * 2 + 5 * TITLE_LINE_HEIGHT);
  });

  it('is the expected one for a Spanish title of eighty characters', () => {
    expect(SPANISH_TITLE).toHaveLength(80);

    const card = nodeCardSize(SPANISH_TITLE, { measure });

    expect(card.lines).toEqual([
      'El transporte',
      'interno no alcanza a',
      'llegar a tiempo a',
      'las aulas del primer',
      'turno.'
    ]);
    expect(card.width).toBe(140);
    expect(card.height).toBe(92);
    expect(card.innerWidth).toBe(120);
  });

  it('grows with the number of lines', () => {
    const short = nodeCardSize('Un nodo', { measure });
    const long = nodeCardSize(SPANISH_TITLE, { measure });

    expect(long.height).toBeGreaterThan(short.height);
    expect(long.lineCount).toBeGreaterThan(short.lineCount);
  });

  it('grows its width for a word that does not fit, and never breaks it', () => {
    // The card is narrower than the word: the word is left intact and the
    // card grows to hold it.
    const card = nodeCardSize('Estacionamiento', { measure, width: 60 });

    expect(card.innerWidth).toBe(90);
    expect(card.width).toBe(90 + CARD_PADDING_X * 2);
    expect(card.lines).toEqual(['Estacionamiento']);
  });

  it('draws the text with a line break between the lines', () => {
    const card = nodeCardSize('uno dos tres', { measure });

    expect(card.text).toBe(card.lines.join('\n'));
    expect(card.text.split('\n')).toHaveLength(card.lineCount);
  });
});

describe('the meta line of a card', () => {
  it('is inside the card: the height of the card reserves it', () => {
    // The meta line is a sibling of the card in the graph — it is drawn
    // with another ink — but it is drawn **inside** the card. The layout
    // reserves the height of the card, so it reserves the meta line too:
    // the gap between two cards never has to hold it.
    const card = nodeCardSize('Un nodo', { measure, meta: 'Problema' });

    expect(card.height).toBe(CARD_PADDING_Y * 2 + TITLE_LINE_HEIGHT + META_LINE_HEIGHT);

    // The line of text is under the title, and the card is tall enough to
    // hold the two of them.
    const top = -card.height / 2;
    const bottom = card.height / 2;

    expect(card.metaY - card.metaHeight / 2).toBeGreaterThan(top);
    expect(card.metaY + card.metaHeight / 2).toBeLessThan(bottom);
    expect(card.metaY).toBeGreaterThan(0);
  });

  it('is inside the card of an expanded node too, with the body', () => {
    const card = nodeCardSize('Un nodo', {
      measure,
      meta: 'Problema · ACTIVE',
      body: 'Una descripción del nodo.'
    });

    const bottom = card.height / 2;

    expect(card.metaY - card.metaHeight / 2).toBeGreaterThan(-card.height / 2);
    expect(card.metaY + card.metaHeight / 2).toBeLessThan(bottom);
    expect(card.bodyY + card.bodyHeight / 2).toBeLessThan(bottom);
  });
});

describe('the fallback measurer', () => {
  it('never returns zero for a text that is not empty', () => {
    const estimate = createEstimateMeasurer();

    expect(estimate('a')).toBeGreaterThan(0);
    expect(estimate('El transporte interno')).toBeGreaterThan(0);
  });

  it('never returns more than the length of the text times the size of the font', () => {
    for (const text of ['a', 'El transporte interno', 'Estacionamiento', 'x'.repeat(200)]) {
      expect(estimateTextWidth(text, TITLE_FONT_SIZE)).toBeLessThanOrEqual(
        text.length * TITLE_FONT_SIZE
      );
    }
  });

  it('is empty for an empty text', () => {
    expect(estimateTextWidth('')).toBe(0);
  });

  it('measures the average glyph of the face', () => {
    expect(estimateTextWidth('abcd', 10)).toBe(4 * 10 * AVERAGE_GLYPH_RATIO);
  });
});
