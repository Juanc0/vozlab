/**
 * The **content and the ink of a card** — what a node says, and the colours
 * it says it with.
 *
 * The module is **pure**: no DOM, no Cytoscape, no API call. It is the part
 * of `./elements` that knows *what* a card is, separated from the part that
 * knows *how Cytoscape draws it*. Two painters share it:
 *
 * - the incumbent, which hands the content to Cytoscape's elements;
 * - the SVG painter of the comparison, which draws the same card as one
 *   `<g>`.
 *
 * The separation is the point of the candidate: a painter must not own the
 * card. `./elements` re-exports everything here, so its public API — and
 * the tests that use it — did not change when the module was extracted.
 */

import type { EdgeStatus, NodeDto, NodeStatus } from '$lib/api/types';
import { displayName } from '$lib/i18n/display-name';
import { DEFAULT_LOCALE } from '$lib/i18n/dictionary';
import { statusLabel } from '$lib/i18n/statuses';
import { formatAttributeValue } from './node-card';

/** The fill of a card: the surface of the design system. */
export const CARD_COLOR = '#ffffff';

/**
 * The ground of the canvas: the colour behind everything.
 *
 * It is the ground of the design system (`--color-ground`), and it is the
 * colour of the plate behind the name of a relation.
 */
export const GROUND_COLOR = '#f5f8fb';

/** The ink of the title of a card: the text of the interface. */
export const CARD_INK = '#1b2128';

/** The ink of the meta line of a card: the muted text of the interface. */
export const CARD_META_INK = '#656c76';

/** The colour of the selection: the accent of the interface. */
export const SELECTION_COLOR = '#2f72c6';

/** The colour of the ring of the node the view presents: the ink. */
export const PRESENTED_COLOR = '#1b2128';

/**
 * The border of the card of a relation.
 *
 * It is the `--color-border` of the design system: the card of a relation is
 * separated from the ground of the canvas by a **tone step**, exactly like
 * the cards of the interface are.
 */
export const RELATION_CARD_BORDER = '#dce1e8';

/**
 * The border of a card, by the status of the node.
 *
 * The default status carries **no mark**: the card is the card. The other
 * statuses carry a border of two pixels in the colour of the status — a
 * mark on the card, not a rule between sections.
 *
 * `PENDING` wears the **secondary** of the palette (`--color-secondary`,
 * the indigo-violet of the governance layer): it is waiting for a
 * decision, and that is not a warning.
 */
const STATUS_BORDER_COLORS: Record<NodeStatus, string> = {
  ACTIVE: CARD_META_INK,
  PENDING: '#6d5fa3',
  DRAFT: CARD_META_INK,
  MERGED: CARD_META_INK,
  DEPRECATED: CARD_META_INK,
  REJECTED: '#c4242a'
};

/**
 * The colour of a relation, by its status.
 *
 * An active relation is the **product itself** — the knowledge of the
 * workspace — and it is drawn in the blue of the brand at the strength a
 * line needs (3.4:1 on the ground). A relation that waits wears the
 * secondary, a draft is written in the muted ink, and a rejected one is
 * the negative of the palette.
 */
const EDGE_COLORS: Record<EdgeStatus, string> = {
  ACTIVE: '#4987d9',
  PENDING: '#8273bb',
  DRAFT: '#656c76',
  REJECTED: '#c4242a'
};

/** The colour of a node of an unknown status. */
const FALLBACK_COLOR = '#656c76';

/**
 * The border of the card of a node, by its status.
 *
 * The default status (`ACTIVE`) has **no border at all**: the card is the
 * card, and a mark that every card wears is not a mark.
 */
export function nodeStatusBorder(status: NodeStatus): { width: number; color: string } {
  if (status === 'ACTIVE') {
    // A soft brand edge on every card: the card is no longer borderless,
    // it carries the hue of the brand at the strength of an edge. It is
    // not a status mark (those are 2px and override it).
    return { width: 1, color: '#99c0f6' };
  }

  return { width: 2, color: STATUS_BORDER_COLORS[status] ?? FALLBACK_COLOR };
}

/** The colour of a relation, by its status. */
export function edgeColor(status: EdgeStatus): string {
  return EDGE_COLORS[status] ?? FALLBACK_COLOR;
}

/** The content of the **card** of a node. */
export interface NodeCardContent {
  /** The title of the node. */
  readonly title: string;
  /** The meta line under the title: the type of the node. */
  readonly meta: string;
  /** The body of the card: the description and the attributes. */
  readonly body: string;
}

/**
 * The content of the **card** of a node.
 *
 * The **meta line** is the type of the node, in the language of the
 * interface: the type is the categorical series of the graph — the
 * difference between a problem and an idea — and it is the first thing a
 * reader needs. The name is the **display name** of the class, which the
 * DTO carries: the API sends the whole map and the client picks the name of
 * its language. A class that the ontology does not know keeps its key: the
 * card must say something, and the key is what the API sent.
 *
 * When the card is **expanded**, the line keeps the status of the node too:
 * the expanded card is the whole node, and the status is part of it. The
 * status is a label of the dictionary, not the value of the system.
 *
 * The **body** is the description and the attributes of the node. It is only
 * there when the card is expanded.
 */
export function nodeCardContent(
  node: NodeDto,
  options: { locale?: string; expanded?: boolean } = {}
): NodeCardContent {
  const expanded = options.expanded === true;
  const locale = options.locale ?? DEFAULT_LOCALE;
  const typeName = displayName(node.typeDisplayNames, locale, node.typeKey);
  const status = statusLabel(locale, 'node', node.status);

  const paragraphs: string[] = [];

  const description = node.description?.trim() ?? '';

  if (expanded && description !== '') {
    paragraphs.push(description);
  }

  if (expanded) {
    for (const [key, value] of Object.entries(node.attributes ?? {})) {
      paragraphs.push(`${key}: ${formatAttributeValue(value)}`);
    }
  }

  return {
    title: node.title,
    meta: expanded ? `${typeName} · ${status}` : typeName,
    body: paragraphs.join('\n')
  };
}
