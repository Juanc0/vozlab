/**
 * The **card of a relation** — its name, its attributes, its author and its
 * dates, and the place the card is drawn in.
 *
 * A relation of the graph is a **relation**, not a line: the window carries
 * its attributes, the pseudonym of its author and the instant it was created,
 * and the reader can ask for the whole of it exactly as he asks for the
 * whole of a node. The card is the answer: the name of the relation, its
 * attributes as key/value rows, its author and its date.
 *
 * The module is **pure**: no DOM, no Cytoscape instance, no API call. The
 * measurer of the text is injected, like the one of the card of a node, and
 * the placement is a number the canvas applies.
 *
 * ## The place of the card
 *
 * The card must not cover the nodes the relation connects: a card that
 * hides a node is a card the reader cannot read past. So the card is drawn
 * **beside** its line, at the middle of it, and it is pushed further away
 * when the place it chose is occupied.
 *
 * The card is wider than it is tall and the line is usually horizontal, so
 * the long side of the card is **along** the line and it hangs above (or
 * below) it. That is why the distance of the card from the line is measured
 * with its **height**: the card is beside the line, never on it.
 *
 * The distance is the **exact** one: the card is pushed away until it
 * clears every node that stands in its way, and not one pixel more. A card
 * that floats far from its line is a card the reader does not connect with
 * the relation it belongs to.
 */

import type { SubgraphEdgeDto } from '$lib/api/types';
import { displayName } from '$lib/i18n/display-name';
import { DEFAULT_LOCALE, formatDate, formatNumber } from '$lib/i18n/dictionary';
import { statusLabel } from '$lib/i18n/statuses';
import { en } from '$lib/i18n/locales/en';
import { es } from '$lib/i18n/locales/es';

/**
 * The nominal width of the card of a relation, in pixels.
 *
 * It is narrower than the card of an expanded node: the name of a relation
 * is a phrase ("Se relaciona con"), not a title, and the card holds the
 * attributes of the relation in rows of key and value.
 */
export const RELATION_CARD_WIDTH = 180;

/**
 * The number of characters of the pseudonym the card shows.
 *
 * The pseudonym is sixty-four characters long: it is a fingerprint, not a
 * name, and a card is not the place to read it whole. The card shows the
 * **beginning** of it — enough to tell two authors apart, never enough to
 * be anything but a pseudonym. The whole of it is in the inspector.
 */
export const PSEUDONYM_LENGTH = 8;

/**
 * The labels of the card of a relation, by language.
 *
 * They are read from the dictionaries of the interface: the card is a piece
 * of the interface and it speaks the language of the reader.
 */
const LABELS: Readonly<Record<string, { author: string; created: string }>> = {
  es: { author: es.inspector.author, created: es.inspector.created },
  en: { author: en.inspector.author, created: en.inspector.created }
};

/**
 * The beginning of a pseudonym.
 *
 * The pseudonym stays a pseudonym: the card never carries an identity, an
 * email or a user id — only the opaque handle the API compares.
 */
export function shortPseudonym(hash: string): string {
  const trimmed = hash.trim();

  if (trimmed.length <= PSEUDONYM_LENGTH) {
    return trimmed;
  }

  return `${trimmed.slice(0, PSEUDONYM_LENGTH)}…`;
}

/** The content of the **card** of a relation. */
export interface RelationCardContent {
  /** The title of the card: the name of the relation. */
  readonly title: string;
  /** The meta line under the title: the status of the relation and its score. */
  readonly meta: string;
  /** The body of the card: the attributes, the author and the date. */
  readonly body: string;
}

/**
 * The content of the card of a relation.
 *
 * The **title** is the display name of the relation, in the language of the
 * interface — the same name the label of the line carries, so the reader
 * sees one name and not two.
 *
 * The **meta line** is the status of the relation and its community score:
 * the two facts of the relation that are not its content.
 *
 * The **body** is the content: the attributes as key/value rows — the same
 * format the card of a node uses — then the author and the date. A relation
 * without attributes still shows its author and its date: the card is never
 * empty.
 */
export function relationCardContent(
  edge: SubgraphEdgeDto,
  options: { locale?: string } = {}
): RelationCardContent {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const labels = LABELS[locale] ?? LABELS[DEFAULT_LOCALE];

  const lines: string[] = [];

  for (const [key, value] of Object.entries(edge.attributes ?? {})) {
    lines.push(`${key}: ${formatValue(value)}`);
  }

  lines.push(`${labels.author}: ${shortPseudonym(edge.authorHash ?? '')}`);
  lines.push(`${labels.created}: ${formatDate(locale, edge.createdAt)}`);

  return {
    title: displayName(edge.relationDisplayNames, locale, edge.relationKey),
    meta: `${statusLabel(locale, 'edge', edge.status)} · ${formatNumber(locale, edge.communityScore)}`,
    body: lines.join('\n')
  };
}

/**
 * Formats the value of an attribute for the card of a relation.
 *
 * The same rule the card of a node uses: a value that is not a text is
 * written as JSON, so the reader sees what the API sent.
 */
function formatValue(value: unknown): string {
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
 * A rectangle of the canvas, in the model coordinates.
 *
 * The centre and the size: the same shape the router of the orthogonal
 * lines uses, so the boxes of the nodes can be handed to the two without a
 * translation.
 */
export interface CardBox {
  /** The centre of the box on the x axis. */
  readonly cx: number;
  /** The centre of the box on the y axis. */
  readonly cy: number;
  /** The width of the box. */
  readonly width: number;
  /** The height of the box. */
  readonly height: number;
}

/**
 * The gap between the card of a relation and its line, in pixels.
 *
 * The card touches the line when it can: it reads as the writing of **that**
 * relation and not as a card that fell on the picture.
 */
export const RELATION_CARD_GAP = 6;

/**
 * How far the card can be pushed away from its line, in pixels.
 *
 * The card walks the two sides of the line and takes the one that keeps it
 * closest to it. When both sides are far — a picture with no room at all —
 * the card takes the first one: a card that covers a node is a bad card,
 * but a card that is nowhere is worse.
 */
const MAX_DISTANCE = 320;

/**
 * Places the card of a relation beside its line.
 *
 * The card is drawn at the **middle** of the line and beside it: the
 * distance from the line is the half of the height of the card and the gap,
 * so the card never stands on the line it belongs to.
 *
 * When the place it chose is occupied — by a node of the window — it is
 * pushed **exactly** as far as it has to be: the card takes the first
 * distance at which it covers nothing. The nodes the relation connects are
 * among the obstacles, so the card never covers them.
 *
 * @param source - The centre of the source node, in the model coordinates.
 * @param target - The centre of the target node, in the model coordinates.
 * @param card - The size of the card.
 * @param obstacles - The boxes the card must not cover.
 * @returns The centre of the card, in the model coordinates.
 */
export function relationCardPlacement(
  source: { x: number; y: number },
  target: { x: number; y: number },
  card: { width: number; height: number },
  obstacles: readonly CardBox[]
): { x: number; y: number } {
  const middle = {
    x: (source.x + target.x) / 2,
    y: (source.y + target.y) / 2
  };

  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy);

  // A relation whose ends are in the same place has no direction: the
  // perpendicular is the vertical one and the card goes below the line.
  const ux = length === 0 ? 1 : dx / length;
  const uy = length === 0 ? 0 : dy / length;
  const px = -uy;
  const py = ux;

  const base = card.height / 2 + RELATION_CARD_GAP;

  // The distance is **signed**: a card above the line and a card below it
  // are two different places, and the picture takes the one that keeps the
  // card closest to its line.
  const above = distanceOf(1, base);
  const below = -distanceOf(-1, base);

  const closest = Math.abs(above) <= Math.abs(below) ? above : below;

  // When both sides are far, the card takes the first one: a card that
  // covers a node is a bad card, but a card that is nowhere is worse.
  const distance =
    Math.abs(closest) <= MAX_DISTANCE
      ? closest
      : Math.abs(above) <= MAX_DISTANCE
        ? above
        : below;

  return {
    x: middle.x + px * distance,
    y: middle.y + py * distance
  };

  /**
   * The distance the card has to keep from the line, on one side.
   *
   * It is the **exact** distance: the card is pushed away until it clears
   * every obstacle that stands in its way, and not one pixel more.
   */
  function distanceOf(side: 1 | -1, minimum: number): number {
    let required = minimum;

    for (const box of obstacles) {
      const corners = [
        { x: box.cx - box.width / 2, y: box.cy - box.height / 2 },
        { x: box.cx + box.width / 2, y: box.cy - box.height / 2 },
        { x: box.cx + box.width / 2, y: box.cy + box.height / 2 },
        { x: box.cx - box.width / 2, y: box.cy + box.height / 2 }
      ];

      let alongMin = Number.POSITIVE_INFINITY;
      let alongMax = Number.NEGATIVE_INFINITY;
      let acrossMin = Number.POSITIVE_INFINITY;
      let acrossMax = Number.NEGATIVE_INFINITY;

      for (const corner of corners) {
        const rx = corner.x - middle.x;
        const ry = corner.y - middle.y;

        const along = rx * ux + ry * uy;
        const across = rx * px + ry * py;

        alongMin = Math.min(alongMin, along);
        alongMax = Math.max(alongMax, along);
        acrossMin = Math.min(acrossMin, across);
        acrossMax = Math.max(acrossMax, across);
      }

      // The obstacle is not in the way of the card: it is far away along
      // the line.
      if (card.width / 2 <= alongMin || -card.width / 2 >= alongMax) {
        continue;
      }

      const edge = side === 1 ? acrossMax : -acrossMin;

      required = Math.max(required, edge + card.height / 2 + RELATION_CARD_GAP);
    }

    return required;
  }
}
