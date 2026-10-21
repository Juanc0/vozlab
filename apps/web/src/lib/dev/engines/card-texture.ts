/**
 * The **card** of a node, drawn on a two-dimensional context.
 *
 * This is the path Sigma.js takes, and it is the answer to the first
 * question of the comparison: **Sigma has no multi-line label inside a
 * node shape**. Its labels are a layer of their own, and a layer draws one
 * line; its node programs are a circle and a point. So the title of a node
 * has to be **baked into a picture**: a rounded rectangle with the title
 * written inside it, drawn here and painted over the WebGL canvas.
 *
 * The picture is drawn from the **pure** module of the card
 * (`$lib/graph/node-card`): the same measurer, the same wrapping, the same
 * radius, the same padding. The title of a node is therefore wrapped the
 * same way in the two engines — a word is never broken in one of them and
 * broken in the other.
 *
 * The module is **dev-only**: it belongs to the comparison of the engines.
 */

import type { NodeDto } from '$lib/api/types';
import {
  CARD_COLOR,
  CARD_INK,
  CARD_META_INK,
  PRESENTED_COLOR,
  SELECTION_COLOR,
  nodeCardContent,
  nodeStatusBorder
} from '$lib/graph/elements';
import {
  CARD_PADDING_X,
  CARD_PADDING_Y,
  CARD_RADIUS,
  META_FONT_SIZE,
  META_LINE_HEIGHT,
  TITLE_FONT_FAMILY,
  TITLE_FONT_SIZE,
  TITLE_LINE_HEIGHT,
  nodeCardSize,
  type TextMeasurer
} from '$lib/graph/node-card';

/** The picture of a card: its size and the writing on it. */
export interface CardTexture {
  /** The width of the card, in pixels. */
  readonly width: number;
  /** The height of the card, in pixels. */
  readonly height: number;
  /** The lines of the title, wrapped and never broken. */
  readonly lines: readonly string[];
  /** The meta line: the type of the node. */
  readonly meta: string;
  /** The colour of the border of the card — the mark of the status. */
  readonly borderColor: string;
  /** The width of the border of the card, in pixels. */
  readonly borderWidth: number;
  /** Whether the card is drawn with its whole content. */
  readonly expanded: boolean;
}

/** How a card is drawn. */
export interface CardTextureOptions {
  /** The measurer of the text of the card. */
  readonly measure?: TextMeasurer;
  /** The language of the interface. */
  readonly locale?: string;
  /** Whether the card is drawn with its whole content. */
  readonly expanded?: boolean;
}

/**
 * The picture of the card of a node.
 *
 * The size and the writing come from the pure module of the card: this is
 * the **same** call the canvas of Cytoscape makes, so the two engines wrap
 * the title in the same lines.
 */
export function cardTextureFor(
  node: NodeDto,
  options: CardTextureOptions = {}
): CardTexture {
  const content = nodeCardContent(node, {
    locale: options.locale,
    expanded: options.expanded === true
  });

  const card = nodeCardSize(content.title, {
    measure: options.measure,
    width: 140,
    meta: content.meta,
    body: ''
  });

  const border = nodeStatusBorder(node.status);

  return {
    width: card.width,
    height: card.height,
    lines: card.lines,
    meta: content.meta,
    borderColor: border.color,
    borderWidth: border.width,
    expanded: options.expanded === true
  };
}

/** How a card is painted. */
export interface CardPaintOptions {
  /** Whether the node is the one the user selected. */
  readonly selected?: boolean;
  /** Whether the node is the one the view presents. */
  readonly presented?: boolean;
}

/**
 * Paints the card of a node on a context.
 *
 * The card is drawn **around the origin**: the caller translates the
 * context to the place of the node, so the card is in the coordinates of
 * the graph and it scales with the camera exactly like the card of
 * Cytoscape.
 *
 * @param context - The context to paint on.
 * @param texture - The picture of the card.
 * @param options - Whether the node is selected or presented.
 */
export function paintCard(
  context: CanvasRenderingContext2D,
  texture: CardTexture,
  options: CardPaintOptions = {}
): void {
  const left = -texture.width / 2;
  const top = -texture.height / 2;

  context.save();

  // The selection is a halo **behind** the card: a tint painted on top of
  // it would tint the card and its title.
  if (options.selected === true) {
    context.beginPath();
    roundedRect(
      context,
      left - 6,
      top - 6,
      texture.width + 12,
      texture.height + 12,
      CARD_RADIUS + 6
    );
    context.fillStyle = 'rgba(37, 99, 235, 0.12)';
    context.fill();
  }

  // The card: a surface of the design system, with the radius of the cards
  // of the interface and no shadow.
  context.beginPath();
  roundedRect(context, left, top, texture.width, texture.height, CARD_RADIUS);
  context.fillStyle = CARD_COLOR;
  context.fill();

  // The status is a **mark**: a border of two pixels in the colour of the
  // status — and nothing at all when the node is active.
  if (texture.borderWidth > 0) {
    context.lineWidth = texture.borderWidth;
    context.strokeStyle = texture.borderColor;
    context.stroke();
  }

  // The selection is a border of three pixels in the accent.
  if (options.selected === true) {
    context.lineWidth = 3;
    context.strokeStyle = SELECTION_COLOR;
    context.stroke();
  }

  // The node the view presents wears a ring of its own: the ring is the
  // ink, and not a colour of the status.
  if (options.presented === true) {
    context.lineWidth = 3;
    context.strokeStyle = PRESENTED_COLOR;
    context.beginPath();
    roundedRect(
      context,
      left - 4.5,
      top - 4.5,
      texture.width + 9,
      texture.height + 9,
      CARD_RADIUS + 4.5
    );
    context.stroke();
  }

  // The title: the ink of the interface, wrapped inside the card.
  context.fillStyle = CARD_INK;
  context.font = `${TITLE_FONT_SIZE}px ${TITLE_FONT_FAMILY}`;
  context.textAlign = 'center';
  context.textBaseline = 'top';

  texture.lines.forEach((line, index) => {
    context.fillText(line, 0, top + CARD_PADDING_Y + index * TITLE_LINE_HEIGHT);
  });

  // The meta line: the type of the node, in the muted ink, under the title.
  if (texture.meta !== '') {
    context.fillStyle = CARD_META_INK;
    context.font = `${META_FONT_SIZE}px ${TITLE_FONT_FAMILY}`;

    const metaTop = top + CARD_PADDING_Y + texture.lines.length * TITLE_LINE_HEIGHT;

    context.fillText(texture.meta, 0, metaTop);
  }

  context.restore();
}

/**
 * Traces a rectangle with round corners.
 *
 * It is the same shape the card of Cytoscape draws with its
 * `corner-radius`: the radius of the design system.
 */
export function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const limit = Math.min(radius, width / 2, height / 2);

  context.moveTo(x + limit, y);
  context.lineTo(x + width - limit, y);
  context.quadraticCurveTo(x + width, y, x + width, y + limit);
  context.lineTo(x + width, y + height - limit);
  context.quadraticCurveTo(x + width, y + height, x + width - limit, y + height);
  context.lineTo(x + limit, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - limit);
  context.lineTo(x, y + limit);
  context.quadraticCurveTo(x, y, x + limit, y);
}

/** The padding of the card on its sides, in pixels. */
export const TEXTURE_PADDING_X = CARD_PADDING_X;

/** The height of a line of the meta line, in pixels. */
export const TEXTURE_META_LINE_HEIGHT = META_LINE_HEIGHT;
