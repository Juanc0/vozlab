/**
 * The mapping from the DTOs to the Cytoscape elements.
 *
 * Pure: no DOM, no Cytoscape instance, no API call. The colours are the
 * ones of the **design system**, and they say what a colour *does*:
 *
 * - the **card** is a surface: it is white (`--color-surface`), and the
 *   canvas behind it is the ground (`--color-ground`). A card is separated
 *   from its background by a **tone step**, exactly like the cards of the
 *   interface are;
 * - the **title** of the card is the ink of the interface (`--color-text`),
 *   and the **meta line** under it is the muted ink (`--color-muted`);
 * - the **status** of a node is a **mark** on the card: a border of two
 *   pixels in the colour of the status. The default status (`ACTIVE`)
 *   carries no mark at all — the card is the card.
 *
 * The status is **never** the fill of the card. A card the size of a
 * business card painted in a saturated colour is a wall of colour, not a
 * picture of a graph, and a fill by status says nothing: every node of a
 * healthy graph has the same status.
 *
 * Every node is a **card**: its title is wrapped inside it and the card is
 * as big as the text it holds. The size is computed by the pure module of
 * `./node-card`, which takes the measurer of the text as an argument.
 */

import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
import { displayName } from '$lib/i18n/display-name';
import { DEFAULT_LOCALE } from '$lib/i18n/dictionary';
import {
  CARD_COLOR,
  CARD_INK,
  CARD_META_INK,
  GROUND_COLOR,
  RELATION_CARD_BORDER,
  SELECTION_COLOR,
  edgeColor,
  nodeCardContent,
  nodeStatusBorder
} from './card-content';
import {
  CARD_PADDING_Y,
  CARD_RADIUS,
  CARD_WIDTH,
  EXPANDED_CARD_WIDTH,
  META_FONT_SIZE,
  META_LINE_HEIGHT,
  TITLE_FONT_FAMILY,
  TITLE_FONT_SIZE,
  TITLE_LINE_HEIGHT,
  formatAttributeValue,
  nodeCardSize,
  type TextMeasurer
} from './node-card';
import {
  RELATION_CARD_WIDTH,
  relationCardContent,
  type RelationCardContent
} from './relation-card';

/**
 * The content and the ink of a card live in `./card-content`.
 *
 * The module is **pure** and shared by the two painters of the graph: the
 * incumbent, which hands the content to the elements of Cytoscape, and the
 * SVG painter of the comparison, which draws the card as one `<g>`. They are
 * re-exported here so the public API of the module — and the tests that use
 * it — did not change when the extraction happened.
 */
export {
  CARD_COLOR,
  CARD_INK,
  CARD_META_INK,
  GROUND_COLOR,
  PRESENTED_COLOR,
  RELATION_CARD_BORDER,
  SELECTION_COLOR,
  edgeColor,
  nodeCardContent,
  nodeStatusBorder,
  type NodeCardContent
} from './card-content';

/**
 * The margin between the top of the card and the title, in pixels.
 *
 * Cytoscape draws the first line of a label with its **baseline** at the
 * anchor plus the size of the font, so the text of a title sits a few
 * pixels below the anchor. The margin takes that offset back: the title
 * starts at the padding of the card, as the padding says it does.
 */
export const TITLE_TEXT_MARGIN_Y = CARD_PADDING_Y - 3;

/** The element of a node, ready for `cy.add()`. */
export interface GraphNodeElement {
  group: 'nodes';
  data: {
    id: string;
    /** The title of the card, with a line break between the lines. */
    label: string;
    /** The name of the type of the node, in the language of the interface. */
    typeKey: string;
    status: string;
    /** The colour of the border of the card — the mark of the status. */
    borderColor: string;
    /** The width of the border of the card, in pixels. */
    borderWidth: number;
    /** Whether the node is drawn with its whole content. */
    expanded: boolean;
    /** The width of the card, in pixels. */
    width: number;
    /** The height of the card, in pixels. */
    height: number;
    /** The width the title has inside the card, in pixels. */
    innerWidth: number;
  };
  /** The classes of the element — the stylesheet keys on them. */
  classes?: string[];
}

/**
 * An element of **text** that belongs to a card: its meta line or its body.
 *
 * The text of a card is not one label: the title is in the ink of the
 * interface and the meta line is in the muted one, and Cytoscape draws one
 * label per element with one ink. The two are therefore two elements: the
 * card, and the line of text that hangs under it.
 *
 * The line is a **sibling** of the card, not its child: a compound node in
 * Cytoscape is sized and placed by its children, and the card is the one
 * that has to keep its own shape. The line is placed by hand, under the
 * card it belongs to, and it follows it.
 */
export interface GraphTextElement {
  group: 'nodes';
  data: {
    id: string;
    /** The card the text belongs to. */
    cardId: string;
    /** The text, with a line break between the lines. */
    label: string;
    /** The width of the text, in pixels. */
    width: number;
    /** The height of the text, in pixels. */
    height: number;
    /** The x of the text, relative to the centre of the card. */
    dx: number;
    /** The y of the text, relative to the centre of the card. */
    dy: number;
  };
  /** The classes of the element — the stylesheet keys on them. */
  classes: string[];
  /** Whether the element can be grabbed by the pointer. Text nodes are not grabbed. */
  grabbable?: boolean;
}

/** The element of a relation, ready for `cy.add()`. */
export interface GraphEdgeElement {
  group: 'edges';
  data: {
    id: string;
    source: string;
    target: string;
    label: string;
    status: string;
    color: string;
    /**
     * The score the community gave the relation.
     *
     * The spring of the exploration view reads it: a relation with a high
     * score pulls its two cards closer and harder.
     */
    communityScore: number;
    /** Whether the relation is drawn as a card with its whole content. */
    expanded: boolean;
  };
}

/** Any element of the graph. */
export type GraphElement = GraphNodeElement | GraphTextElement | GraphEdgeElement;

/** The class of a node that is drawn with its whole content. */
export const EXPANDED_CLASS = 'vozlab-expanded';

/** The class of the **card** of a node. */
export const CARD_CLASS = 'vozlab-card';

/** The class of the meta line of a card. */
export const META_CLASS = 'vozlab-meta';

/** The class of the body of a card. */
export const BODY_CLASS = 'vozlab-body';

/**
 * The class of the **card of a relation**.
 *
 * It is a class of its own: the card of a relation is not a node of the
 * window, so it takes no part in the layout — it is placed by hand, beside
 * the line it belongs to — and it has no badge of its own in the layer of
 * the controls.
 */
export const RELATION_CARD_CLASS = 'vozlab-relation-card';

/** The suffix of the id of the card of a relation. */
export const RELATION_CARD_SUFFIX = '#card';

/**
 * The id of the relation a card belongs to.
 *
 * The card of a relation and the text that hangs under it are elements of
 * their own: a click on the text is a click on the card, and a click on the
 * card is a click on the relation.
 *
 * @returns The id of the relation, or `null` when the element is not part
 *   of the card of a relation.
 */
export function relationIdOf(element: { id(): string; data(key: string): unknown }): string | null {
  const raw = element.data('cardId');
  const cardId = typeof raw === 'string' && raw !== '' ? raw : element.id();

  if (!cardId.endsWith(RELATION_CARD_SUFFIX)) {
    return null;
  }

  return cardId.slice(0, cardId.length - RELATION_CARD_SUFFIX.length);
}

/**
 * Formats the value of an attribute for the card of a node.
 *
 * The rule lives in `./node-card`: the card of a node and the card of a
 * relation show the attributes in the same format.
 */
export { formatAttributeValue };

/** How a node is drawn. */
export interface NodeElementOptions {
  /** Whether the node is drawn with its whole content. */
  expanded?: boolean;
  /** The measurer of the text of the card. */
  measure?: TextMeasurer;
  /**
   * The language of the interface.
   *
   * The names of the class and the status of the node are read in it.
   */
  locale?: string;
}

/** The element of one node, and the elements of its text. */
export function toNodeElements(
  node: NodeDto,
  options: NodeElementOptions = {}
): GraphElement[] {
  const expanded = options.expanded === true;
  const content = nodeCardContent(node, {
    locale: options.locale,
    expanded
  });

  // The card carries the content of the node; a node that is not expanded
  // carries its title and its type alone.
  const card = nodeCardSize(content.title, {
    measure: options.measure,
    width: expanded ? EXPANDED_CARD_WIDTH : CARD_WIDTH,
    meta: content.meta,
    body: expanded ? content.body : ''
  });

  const border = nodeStatusBorder(node.status);

  const cardElement: GraphNodeElement = {
    group: 'nodes',
    data: {
      id: node.id,
      label: card.text,
      typeKey: node.typeKey,
      status: node.status,
      borderColor: border.color,
      borderWidth: border.width,
      expanded,
      width: card.width,
      height: card.height,
      innerWidth: card.innerWidth
    },
    classes: expanded ? [CARD_CLASS, EXPANDED_CLASS] : [CARD_CLASS]
  };

  const elements: GraphElement[] = [cardElement];

  // The meta line: the type of the node, under the title.
  if (content.meta !== '') {
    elements.push({
      group: 'nodes',
      data: {
        id: `${node.id}#meta`,
        cardId: node.id,
        label: content.meta,
        width: card.metaWidth + 2,
        height: card.metaHeight,
        dx: 0,
        dy: card.metaY
      },
      classes: [META_CLASS],
      grabbable: false
    });
  }

  // The body: the description and the attributes, under the meta line.
  if (content.body !== '') {
    elements.push({
      group: 'nodes',
      data: {
        id: `${node.id}#body`,
        cardId: node.id,
        label: card.body,
        width: card.innerWidth,
        height: card.bodyHeight,
        dx: 0,
        dy: card.bodyY
      },
      classes: [BODY_CLASS],
      grabbable: false
    });
  }

  return elements;
}

/** The element of one node. */
export function toNodeElement(node: NodeDto, options: NodeElementOptions = {}): GraphNodeElement {
  const [card] = toNodeElements(node, options) as [GraphNodeElement];

  return card;
}

/**
 * The element of one relation.
 *
 * The label of a relation is the **display name** of its property, in the
 * language of the interface: the label is what the reader reads, and the key
 * of the system (`RELATES_TO`) is the last resort — a relation whose
 * property is not in the ontology keeps its key.
 *
 * A relation that is **expanded** is drawn as a card and not as a label:
 * the name of the relation is in the card, and the line is left bare. The
 * line of a relation is not a text field: it is a line.
 */
export function toEdgeElement(
  edge: SubgraphEdgeDto,
  options: { locale?: string; expanded?: boolean } = {}
): GraphEdgeElement {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const expanded = options.expanded === true;

  return {
    group: 'edges',
    data: {
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      label: expanded ? '' : displayName(edge.relationDisplayNames, locale, edge.relationKey),
      status: edge.status,
      color: edgeColor(edge.status),
      communityScore: edge.communityScore,
      expanded
    }
  };
}

/** How a relation is drawn. */
export interface RelationElementOptions {
  /** Whether the relation is drawn as a card with its whole content. */
  expanded?: boolean;
  /** The measurer of the text of the card. */
  measure?: TextMeasurer;
  /** The language of the interface. */
  locale?: string;
}

/**
 * The elements of the **card of a relation**, and of the text that hangs
 * under it.
 *
 * The card is a card of a node: the same measurement, the same padding and
 * the same radius. What it holds is the **relation**: its name, its
 * attributes, its author and its date.
 *
 * The text is not one label: Cytoscape draws one label per element with one
 * ink, and the card needs three — the title in the ink of the interface,
 * the meta line and the body in the muted one. So the card is the element
 * that carries the title and the two lines are elements of their own, hung
 * under it, exactly like the card of a node.
 */
export function toRelationCardElements(
  edge: SubgraphEdgeDto,
  options: RelationElementOptions = {}
): GraphElement[] {
  const content: RelationCardContent = relationCardContent(edge, {
    locale: options.locale
  });

  const card = nodeCardSize(content.title, {
    measure: options.measure,
    width: RELATION_CARD_WIDTH,
    meta: content.meta,
    body: content.body
  });

  const cardId = `${edge.id}${RELATION_CARD_SUFFIX}`;

  const elements: GraphElement[] = [
    {
      group: 'nodes',
      data: {
        id: cardId,
        label: card.text,
        typeKey: edge.relationKey,
        status: edge.status,
        borderColor: CARD_META_INK,
        borderWidth: 0,
        expanded: true,
        width: card.width,
        height: card.height,
        innerWidth: card.innerWidth
      },
      classes: [RELATION_CARD_CLASS]
    }
  ];

  if (content.meta !== '') {
    elements.push({
      group: 'nodes',
      data: {
        id: `${edge.id}#meta`,
        cardId,
        label: card.meta,
        width: card.metaWidth + 2,
        height: card.metaHeight,
        dx: 0,
        dy: card.metaY
      },
      classes: [META_CLASS],
      grabbable: false
    });
  }

  if (content.body !== '') {
    elements.push({
      group: 'nodes',
      data: {
        id: `${edge.id}#body`,
        cardId,
        label: card.body,
        width: card.innerWidth,
        height: card.bodyHeight,
        dx: 0,
        dy: card.bodyY
      },
      classes: [BODY_CLASS],
      grabbable: false
    });
  }

  return elements;
}

/** How the elements of a graph are drawn. */
export interface GraphElementOptions {
  /** The nodes that are drawn with their whole content. */
  expandedIds?: ReadonlySet<string>;
  /** The relations that are drawn as a card with their whole content. */
  expandedEdgeIds?: ReadonlySet<string>;
  /** The measurer of the text of the cards. */
  measure?: TextMeasurer;
  /**
   * The language of the interface.
   *
   * The name of the class of a node, the name of the relation of an edge
   * and the status of a node are read in it. The API does not negotiate the
   * language: it sends the whole map of the names and the client picks the
   * one of its language.
   */
  locale?: string;
}

/**
 * The elements of a subgraph: the nodes first, then the relations.
 *
 * The text of a card comes **after** the card it belongs to: Cytoscape needs
 * the parent to be in the graph before a child can hang under it.
 *
 * A relation that is expanded brings its **card**: the card comes right
 * after the line it belongs to, so the picture reads the line and then the
 * writing of the relation.
 */
export function toGraphElements(
  nodes: readonly NodeDto[],
  edges: readonly SubgraphEdgeDto[],
  options: GraphElementOptions = {}
): GraphElement[] {
  const expanded = options.expandedIds ?? new Set<string>();
  const expandedEdges = options.expandedEdgeIds ?? new Set<string>();
  const locale = options.locale ?? DEFAULT_LOCALE;

  const elements: GraphElement[] = [];

  for (const node of nodes) {
    elements.push(
      ...toNodeElements(node, {
        expanded: expanded.has(node.id),
        measure: options.measure,
        locale
      })
    );
  }

  for (const edge of edges) {
    const isExpanded = expandedEdges.has(edge.id);

    elements.push(toEdgeElement(edge, { locale, expanded: isExpanded }));

    if (isExpanded) {
      elements.push(
        ...toRelationCardElements(edge, {
          measure: options.measure,
          locale
        })
      );
    }
  }

  return elements;
}
