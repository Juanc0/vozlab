/**
 * The **card of a node** — its title, wrapped, and the size of the card that
 * holds it.
 *
 * Every node of the canvas is a card: a rectangle with round corners whose
 * **height grows with the title**. The title lives **inside** the card,
 * wrapped in as many lines as it needs, and a word is **never** broken.
 *
 * The card is a **surface**, not a picture: it is white, and the canvas
 * behind it is the ground of the interface. What the card carries is its
 * **text**, in three pieces:
 *
 * - the **title**, in the ink of the interface — the label of the card;
 * - the **meta line**, under the title: the type of the node, in the muted
 *   ink. The type is the categorical series of the graph — the difference
 *   between a problem and an idea — and it is the only mark of the card;
 * - the **body**, under the meta line: the description and the attributes of
 *   the node. It is only there when the card is **expanded**.
 *
 * The module is **pure**: it takes the measurer of the text as an argument
 * and answers with numbers. The measurer is the only part that needs a
 * browser, and it is injected, so the wrapping is tested with a
 * deterministic measurer and the real one is only used by the canvas.
 *
 * ## The long word
 *
 * A word that does not fit in the inner width of the card is **never** broken:
 * `Estacionamiento` is not an English word that fits by accident, and a
 * Spanish title has to stay readable.
 *
 * The rule of this module is: **the word is left intact and the card grows**.
 * The inner width of the card becomes the width of the longest word of the
 * title, and the card is as wide as that word plus its padding. The
 * alternative — a card of the nominal width with a word that overflows it —
 * would put the text outside the card and the reader would not know that the
 * word continues.
 *
 * A card that grows for one long word is a rare card: the titles of a
 * knowledge graph are sentences, and a sentence has short words.
 */

/** Measures a run of text. The real one uses a canvas; the test one is a function. */
export type TextMeasurer = (text: string) => number;

/**
 * The nominal width of a card, in pixels.
 *
 * The card is **semi-square**: with the four lines of a long title it is
 * about as tall as it is wide.
 */
export const CARD_WIDTH = 140;

/**
 * The nominal width of the card of an **expanded** node, in pixels.
 *
 * The expanded card holds the description of the node, and a description in
 * a column of twenty characters is not a description: the card of the whole
 * content of a node is as wide as a paragraph.
 */
export const EXPANDED_CARD_WIDTH = 260;

/** The padding of a card on its sides, in pixels. */
export const CARD_PADDING_X = 10;

/** The padding of a card above and below its text, in pixels. */
export const CARD_PADDING_Y = 6;

/**
 * The radius of the corners of a card, in pixels.
 *
 * It is the `--radius-card` of the design system (8px). Cytoscape draws the
 * radius with the `corner-radius` property, so the card of the canvas has
 * the same radius as the card of the interface.
 */
export const CARD_RADIUS = 8;

/**
 * The size of the title of a card.
 *
 * It is the `--text-small` of the design system (12px): the canvas has to
 * fit two hundred cards, and a card with a readable title at 14px would be a
 * card a quarter of the screen.
 */
export const TITLE_FONT_SIZE = 12;

/**
 * The height of a line of the title, in pixels.
 *
 * It is the `--text-small--line-height` of the design system (16px).
 */
export const TITLE_LINE_HEIGHT = 16;

/**
 * The size of the font of the **meta line**, in pixels.
 *
 * It is the `--text-small` of the design system (12px), the same size as the
 * title: the canvas has to fit two hundred cards, and the meta line is a
 * caption, not a second title. What tells the two apart is the **ink**: the
 * title is the ink of the interface, the meta line is the muted one.
 */
export const META_FONT_SIZE = 12;

/**
 * The height of the meta line, in pixels.
 *
 * It is the `--text-small--line-height` of the design system (16px).
 */
export const META_LINE_HEIGHT = 16;

/**
 * The face of the title.
 *
 * It is the `--font-sans` of the design system. The measurer and Cytoscape
 * have to measure the text with **the same** face, or the lines of the card
 * and the lines Cytoscape draws would not be the same lines.
 *
 * The names are quoted with **double** quotes: Cytoscape only accepts the
 * word characters, the hyphen, the space and the double quote in a font
 * family, and a family it refuses is a family it does not use — the text
 * would be drawn with another face than the one that was measured.
 */
export const TITLE_FONT_FAMILY =
  '"IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * The width of an average glyph, as a fraction of the size of the font.
 *
 * It is the ratio of IBM Plex Sans: the average lowercase glyph of the face
 * is a little over half of the size of the font.
 *
 * The estimate is **above** the real width: on the twenty-four titles of the
 * demo it is about twenty per cent wider than the face measures them. That
 * is the safe direction — a card that is a little too tall is a card that
 * reads, and a card that is too short is a card whose text spills out of it.
 */
export const AVERAGE_GLYPH_RATIO = 0.55;

/**
 * Estimates the width of a run of text.
 *
 * It is the **fallback** of the measurer: the one that answers when there is
 * no canvas to measure with — a server pass, a test, a browser in private
 * mode. It never returns zero for a text that is not empty, and it never
 * returns more than the length of the text times the size of the font.
 */
export function estimateTextWidth(text: string, fontSize: number = TITLE_FONT_SIZE): number {
  if (text === '') {
    return 0;
  }

  return text.length * fontSize * AVERAGE_GLYPH_RATIO;
}

/**
 * The measurer that estimates.
 *
 * It is the fallback of {@link defaultTextMeasurer} and it is exported on
 * its own, because its properties are the ones the module guarantees.
 */
export function createEstimateMeasurer(fontSize: number = TITLE_FONT_SIZE): TextMeasurer {
  return (text: string) => estimateTextWidth(text, fontSize);
}

/**
 * The measurer that measures with a canvas.
 *
 * It returns `null` when there is no canvas to measure with: a server pass,
 * a test, a browser that does not give a 2D context. The caller falls back
 * to the estimate.
 *
 * The width is **rounded up**, exactly like Cytoscape does: the two have to
 * agree on whether a line fits, or Cytoscape would wrap a line the module
 * already wrapped and the card would not be tall enough.
 */
export function createCanvasMeasurer(fontSize: number = TITLE_FONT_SIZE): TextMeasurer | null {
  if (typeof document === 'undefined') {
    return null;
  }

  // A DOM without a 2D context (jsdom without the `canvas` package) has no
  // `CanvasRenderingContext2D`: asking for a context there is an error the
  // console would print.
  if (typeof globalThis.CanvasRenderingContext2D === 'undefined') {
    return null;
  }

  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (context === null) {
      return null;
    }

    context.font = `${fontSize}px ${TITLE_FONT_FAMILY}`;

    return (text: string) => {
      if (text === '') {
        return 0;
      }

      const width = context.measureText(text).width;

      return Number.isFinite(width) ? Math.ceil(width) : 0;
    };
  } catch {
    return null;
  }
}

/** The measurer of the module — the canvas one, or the estimate. */
let sharedMeasurer: TextMeasurer | null = null;

/**
 * The measurer the canvas uses when nobody injects one.
 *
 * It is the canvas one when the browser can measure, and the estimate when
 * it cannot. The measurer is built **once**: a canvas and a context are not
 * free, and every card of the graph asks the same questions.
 */
export function defaultTextMeasurer(): TextMeasurer {
  if (sharedMeasurer === null) {
    sharedMeasurer = createCanvasMeasurer() ?? createEstimateMeasurer();
  }

  return sharedMeasurer;
}

/**
 * Waits for the face of the title.
 *
 * The measurer measures with the face that is **loaded**: a canvas that
 * measures before the face arrives measures with the fallback of the system,
 * and the card would be sized for a font that is not the one that is drawn.
 *
 * The canvas waits for the face before it draws the first picture.
 */
export async function ensureTitleFont(fontSize: number = TITLE_FONT_SIZE): Promise<void> {
  if (typeof document === 'undefined') {
    return;
  }

  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;

  if (fonts === undefined) {
    return;
  }

  try {
    await fonts.load(`${fontSize}px "IBM Plex Sans"`);
  } catch {
    // The face is not there: the estimate answers, and the card is a little
    // off. It is better than a canvas that never draws.
  }
}

/**
 * Splits a title into lines that never break a word.
 *
 * The wrapping is **greedy**: the line is filled with as many words as fit,
 * and it is broken at the last space that fits. A word that does not fit in
 * the width of the line is put on a line of its own — it is never broken.
 *
 * A title with a line break in it is a title with **paragraphs**: every
 * paragraph is wrapped on its own and the lines of the paragraphs follow
 * each other.
 *
 * @param title - The title to wrap.
 * @param maxWidth - The width of the line, in pixels.
 * @param measure - The measurer of the text.
 * @returns The lines of the title, without the words broken.
 */
export function wrapTitle(title: string, maxWidth: number, measure: TextMeasurer): string[] {
  const paragraphs = title.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter((word) => word !== '');

    if (words.length === 0) {
      continue;
    }

    let current = words[0] as string;

    for (const word of words.slice(1)) {
      const candidate = `${current} ${word}`;

      if (measure(candidate) <= maxWidth) {
        current = candidate;
        continue;
      }

      lines.push(current);
      current = word;
    }

    lines.push(current);
  }

  return lines;
}

/** How a card is measured and sized. */
export interface CardOptions {
  /** The measurer of the text. The default one measures with a canvas. */
  measure?: TextMeasurer;
  /** The nominal width of the card, in pixels. */
  width?: number;
  /** The padding of the card on its sides, in pixels. */
  paddingX?: number;
  /** The padding of the card above and below its text, in pixels. */
  paddingY?: number;
  /** The size of the font of the title, in pixels. */
  fontSize?: number;
  /** The height of a line of the title, in pixels. */
  lineHeight?: number;
  /**
   * The **meta line** of the card — the type of the node.
   *
   * It is one line, under the title, and it is never wrapped: a card grows
   * to hold it whole, exactly as it grows to hold a long word of the title.
   */
  meta?: string;
  /**
   * The **body** of the card — the description and the attributes.
   *
   * It is only there when the card is expanded, and it is wrapped in as many
   * lines as it needs, like the title.
   */
  body?: string;
}

/** The size of a card, and the text it draws. */
export interface CardSize {
  /** The width of the card, in pixels. */
  readonly width: number;
  /** The height of the card, in pixels. */
  readonly height: number;
  /** The width the text of the card has, in pixels. */
  readonly innerWidth: number;
  /** The lines of the title. */
  readonly lines: readonly string[];
  /** The number of lines of the title. */
  readonly lineCount: number;
  /** The text of the card, with a line break between the lines. */
  readonly text: string;
  /** The height of the block of the title, in pixels. */
  readonly titleHeight: number;
  /** The meta line of the card. */
  readonly meta: string;
  /** The width the meta line needs, in pixels. */
  readonly metaWidth: number;
  /** The height of the meta line, in pixels. */
  readonly metaHeight: number;
  /** The text of the body of the card, with a line break between the lines. */
  readonly body: string;
  /** The number of lines of the body. */
  readonly bodyLineCount: number;
  /** The height of the block of the body, in pixels. */
  readonly bodyHeight: number;
  /**
   * The y of the meta line, relative to the **centre** of the card.
   *
   * It is the position of the line of text that is drawn under the title:
   * the canvas draws it as an element of its own, and the element is placed
   * with this number.
   */
  readonly metaY: number;
  /**
   * The y of the body, relative to the **centre** of the card.
   *
   * It is the position of the block of text that is drawn under the meta
   * line.
   */
  readonly bodyY: number;
}

/**
 * The size of the card that holds a title.
 *
 * The width of the card is the nominal one, unless a word of the title — or
 * the meta line — is wider than the text of the card: then the card grows to
 * hold it whole (see the note of the module).
 *
 * The height of the card is the text: a line per line of the title, the meta
 * line, the body, and the padding above and below.
 *
 * @param title - The title of the card. A line break in it starts a
 *   paragraph, and every paragraph is wrapped on its own.
 * @param options - How the card is measured and sized.
 * @returns The size of the card and the text it draws.
 */
export function nodeCardSize(title: string, options: CardOptions = {}): CardSize {
  const measure = options.measure ?? defaultTextMeasurer();
  const paddingX = options.paddingX ?? CARD_PADDING_X;
  const paddingY = options.paddingY ?? CARD_PADDING_Y;
  const lineHeight = options.lineHeight ?? TITLE_LINE_HEIGHT;
  const nominalWidth = options.width ?? CARD_WIDTH;
  const meta = options.meta ?? '';
  const body = options.body ?? '';

  const paragraphs = title.split('\n');
  const words = paragraphs.flatMap((paragraph) =>
    paragraph.trim().split(/\s+/).filter((word) => word !== '')
  );

  // The longest word of the title: the card has to be wide enough to hold
  // it whole, or the word would have to be broken.
  let longestWord = 0;

  for (const word of words) {
    longestWord = Math.max(longestWord, measure(word));
  }

  // The meta line is one line: the card holds it whole, or it would be
  // broken in a half-word.
  const metaWidth = meta === '' ? 0 : measure(meta);

  const innerWidth = Math.max(
    1,
    Math.ceil(Math.max(nominalWidth - paddingX * 2, longestWord, metaWidth))
  );
  const lines = wrapTitle(title, innerWidth, measure);

  // A card with no text at all is a card with one empty line: a card of
  // zero height would not be a card.
  const lineCount = Math.max(1, lines.length);
  const titleHeight = lineCount * lineHeight;

  // The body is wrapped on its own: it is a paragraph, not a title.
  const bodyLines = body === '' ? [] : wrapTitle(body, innerWidth, measure);
  const bodyLineCount = bodyLines.length;
  const bodyHeight = bodyLineCount * lineHeight;

  const metaHeight = meta === '' ? 0 : META_LINE_HEIGHT;

  const height = paddingY * 2 + titleHeight + metaHeight + bodyHeight;

  // The y of the blocks, relative to the centre of the card: the meta line
  // is right under the title, and the body right under the meta line.
  const metaY =
    metaHeight === 0 ? 0 : paddingY + titleHeight + metaHeight / 2 - height / 2;
  const bodyY =
    bodyHeight === 0 ? 0 : paddingY + titleHeight + metaHeight + bodyHeight / 2 - height / 2;

  return {
    width: innerWidth + paddingX * 2,
    height,
    innerWidth,
    lines,
    lineCount,
    text: lines.join('\n'),
    titleHeight,
    meta,
    metaWidth,
    metaHeight,
    body: bodyLines.join('\n'),
    bodyLineCount,
    bodyHeight,
    metaY,
    bodyY
  };
}
