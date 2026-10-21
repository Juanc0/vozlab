<script lang="ts">
  import type { Position } from 'cytoscape';
  import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
  import type { EdgeStyle } from '$lib/graph/explore/edge-style';
  import type { ExplorationInstance, RenderedBox, RenderedRelation } from '$lib/graph/explore/instance';
  import { edgeColor, formatAttributeValue } from '$lib/graph/elements';
  import { shortPseudonym } from '$lib/graph/relation-card';
  import { ensureTitleFont } from '$lib/graph/node-card';
  import { displayName } from '$lib/i18n/display-name';
  import { formatDate, formatNumber } from '$lib/i18n';
  import { getLocaleState } from '$lib/state/context';

  interface Props {
    /** The nodes of the exploration window. */
    nodes?: NodeDto[];
    /** The relations of the exploration window. */
    edges?: SubgraphEdgeDto[];
    /** The nodes that are drawn as a card. */
    expandedIds?: ReadonlySet<string>;
    /** The relations that are drawn as a card with their whole content. */
    expandedEdgeIds?: ReadonlySet<string>;
    /** The shape the relations are drawn with. */
    edgeStyle?: EdgeStyle;
    /** The id of the selected node, or `null` when nothing is selected. */
    selectedNodeId?: string | null;
    /** The id of the selected relation, or `null` when nothing is selected. */
    selectedEdgeId?: string | null;
    /** The id of the node the view presents. */
    presentedNodeId?: string | null;
    /** Called when the user selects (or clears) a node in the canvas. */
    onselect?: (nodeId: string | null) => void;
    /** Called when the user expands or collapses a node. */
    ontoggle?: (nodeId: string) => void;
    /** Called when the user selects a relation — by tapping its card. */
    onselectedge?: (edgeId: string) => void;
    /** Called when the user expands or collapses a relation. */
    ontoggleedge?: (edgeId: string) => void;
  }

  let {
    nodes = [],
    edges = [],
    expandedIds = new Set<string>(),
    expandedEdgeIds = new Set<string>(),
    edgeStyle = 'bezier',
    selectedNodeId = null,
    selectedEdgeId = null,
    presentedNodeId = null,
    onselect,
    ontoggle,
    onselectedge,
    ontoggleedge
  }: Props = $props();

  const locale = getLocaleState();
  const t = locale.t;

  const uid = $props.id();
  const descriptionId = `explore-canvas-description-${uid}`;

  /**
   * The distance between the badge of a node and the corner of the node.
   *
   * The badge sits **outside** the node: a node that is drawn as a small dot
   * would be covered by its own badge, and the user could not drag it.
   */
  const BADGE_GAP = 6;

  /**
   * The distance between the badge of a relation and its line.
   *
   * The badge of a relation is **on** the line, but not on its label: the
   * name of the relation is written along the arrow, and the badge has to
   * sit beside it.
   */
  const RELATION_BADGE_GAP = 16;

  let container: HTMLDivElement | undefined = $state();
  let overlay: HTMLDivElement | undefined = $state();
  let relationOverlay: HTMLDivElement | undefined = $state();

  // `$state.raw`: the Cytoscape instance is an opaque object, it must not be
  // wrapped in a reactive proxy.
  let instance = $state.raw<ExplorationInstance | null>(null);

  /**
   * The places the user put the dragged nodes in.
   *
   * They live in the state of the component and are gone when the page is
   * reloaded — a dragged node is a temporary thing.
   */
  const pinned = new Map<string, Position>();

  /** Where every node is drawn, in the rendered coordinates of the canvas. */
  let badgePositions = $state.raw<Map<string, RenderedBox>>(new Map());

  /** Where the line of every relation is, in the rendered coordinates. */
  let relationBadgePositions = $state.raw<Map<string, RenderedRelation>>(new Map());

  /** Where the card of every expanded relation is, in the rendered coordinates. */
  let relationCardPositions = $state.raw<Map<string, RenderedBox>>(new Map());

  /**
   * The last positions the badges were moved to.
   *
   * It is **not** reactive on purpose: the effect that patches the elements
   * moves the badges, and if it read the reactive state the badges would
   * depend on the elements — the layout would run again on every frame of a
   * drag, and the dragged node would be destroyed by its own layout.
   */
  let lastPositions = new Map<string, RenderedBox>();

  /** The last positions the badges of the relations were moved to. */
  let lastRelationPositions = new Map<string, RenderedRelation>();

  /** The last positions the cards of the relations were moved to. */
  let lastCardPositions = new Map<string, RenderedBox>();

  /** The badge that is in the tab order of the layer of the controls. */
  let activeIndex = $state(0);

  /** The badge of a relation that is in the tab order of its layer. */
  let activeRelationIndex = $state(0);

  /** What the pointer is over. */
  interface Preview {
    readonly kind: 'node' | 'edge';
    readonly id: string;
    readonly x: number;
    readonly y: number;
  }

  let preview = $state<Preview | null>(null);

  /**
   * The node the pointer is over.
   *
   * The badge of a node is only shown when the pointer is near it: a
   * picture with twenty-four badges on it reads badly, and a badge that
   * covers the node it belongs to would keep the user from dragging it.
   */
  let hoveredNodeId = $state<string | null>(null);

  /** The node whose badge has the focus. */
  let focusedNodeId = $state<string | null>(null);

  /**
   * The relation the pointer is over.
   *
   * The badge of a relation is on its line, and the line is thin: the badge
   * would cover the name of the relation if it were drawn on it.
   */
  let hoveredEdgeId = $state<string | null>(null);

  /** The relation whose badge has the focus. */
  let focusedEdgeId = $state<string | null>(null);

  /**
   * The callbacks are read through holders.
   *
   * The parent passes a new closure on every render; reading the prop inside
   * the effect that creates the instance would re-create the canvas on every
   * render of the parent. The holder breaks that dependency.
   */
  let selectHandler: ((nodeId: string | null) => void) | undefined;
  let toggleHandler: ((nodeId: string) => void) | undefined;
  let selectEdgeHandler: ((edgeId: string) => void) | undefined;
  let toggleEdgeHandler: ((edgeId: string) => void) | undefined;

  $effect(() => {
    selectHandler = onselect;
    toggleHandler = ontoggle;
    selectEdgeHandler = onselectedge;
    toggleEdgeHandler = ontoggleedge;
  });

  /**
   * Creates the instance **once** and destroys it on unmount.
   *
   * The effect reads the container and nothing else: a new window patches the
   * elements (see below), it never re-creates the canvas.
   */
  $effect(() => {
    const element = container;
    if (element === undefined) {
      return;
    }

    let created: ExplorationInstance | null = null;
    let cancelled = false;

    // Cytoscape draws to a `<canvas>`: it needs a DOM. The module is
    // imported here so the server pass never evaluates it.
    //
    // The face of the title is awaited first: the card is measured with the
    // face that is **loaded**, and a card measured with the fallback of the
    // system would be sized for a font that is not the one that is drawn.
    void (async () => {
      await ensureTitleFont();

      const { createExplorationInstance } = await import('$lib/graph/explore/instance');

      if (cancelled) {
        return;
      }

      created = createExplorationInstance({
        container: element,
        onselect: (nodeId) => selectHandler?.(nodeId),
        onselectedge: (edgeId) => selectEdgeHandler?.(edgeId),
        onpreview: (next, related) => {
          preview = next;

          if (next !== null) {
            if (next.kind === 'node') {
              hoveredNodeId = next.id;
            } else {
              hoveredEdgeId = next.id;
            }
            return;
          }

          // The pointer left the node. If it went to the badge of that very
          // node, the badge stays: it must not disappear under the pointer.
          const overBadge =
            related instanceof HTMLElement &&
            related.dataset['nodeId'] === hoveredNodeId;

          if (!overBadge) {
            hoveredNodeId = null;
          }

          // The badge of a **relation** stays until the pointer leaves the
          // canvas: the badge is a few pixels away from the line, and a
          // badge that disappears as the pointer travels to it is a badge
          // nobody can ever click.
        },
        ondrag: (nodeId, position) => {
          // The node keeps the place it was put; the next layout keeps it
          // there too.
          pinned.set(nodeId, { x: position.x, y: position.y });
          created?.refreshRoutes();
        },
        onrender: () => {
          if (created !== null) {
            moveBadges(created.positions());
            moveRelationBadges(created.relationPositions());
            moveRelationCards(created.relationCards());
          }
        }
      });

      instance = created;
    })();

    return () => {
      cancelled = true;
      created?.destroy();
      instance = null;
    };
  });

  /** Patches the elements when the data changes — the instance survives. */
  $effect(() => {
    const graph = instance;
    const currentNodes = nodes;
    const currentEdges = edges;
    const currentExpanded = expandedIds;
    const currentExpandedEdges = expandedEdgeIds;
    const currentStyle = edgeStyle;
    const currentPresented = presentedNodeId;
    const currentLocale = locale.locale;

    if (graph === null) {
      return;
    }

    graph.setElements(currentNodes, currentEdges, {
      expandedIds: currentExpanded,
      expandedEdgeIds: currentExpandedEdges,
      edgeStyle: currentStyle,
      presentedNodeId: currentPresented,
      pinned,
      locale: currentLocale
    });

    moveBadges(graph.positions());
    moveRelationBadges(graph.relationPositions());
    moveRelationCards(graph.relationCards());
  });

  /** Reflects the selection, whether it comes from the canvas or the list. */
  $effect(() => {
    const graph = instance;
    const selected = selectedNodeId;

    if (graph === null) {
      return;
    }

    graph.setSelected(selected);
  });

  /**
   * Moves the badges of the nodes.
   *
   * The badges follow the picture: they are placed over the node they
   * belong to, so they move when the picture is panned, zoomed or laid out
   * again. The positions are only written when they change, or the canvas
   * would re-render on every frame of a drag.
   */
  function moveBadges(next: Map<string, RenderedBox>): void {
    if (samePositions(lastPositions, next)) {
      return;
    }

    lastPositions = next;
    badgePositions = next;
  }

  /**
   * Moves the badges of the relations.
   *
   * They follow the picture too: they are placed on the line they belong
   * to, so they move when the picture is panned, zoomed or laid out again.
   */
  function moveRelationBadges(next: Map<string, RenderedRelation>): void {
    if (sameRelationPositions(lastRelationPositions, next)) {
      return;
    }

    lastRelationPositions = next;
    relationBadgePositions = next;
  }

  /** Moves the cards of the relations — they are drawn in the canvas. */
  function moveRelationCards(next: Map<string, RenderedBox>): void {
    if (samePositions(lastCardPositions, next)) {
      return;
    }

    lastCardPositions = next;
    relationCardPositions = next;
  }

  /**
   * The leader of every expanded relation: the line that joins the card of
   * the relation to the relation itself.
   *
   * The card cannot stand on the line — it would cover the nodes the
   * relation connects — so it is drawn beside it. The leader is what says
   * which relation the card belongs to: it is the callout of the relation,
   * the way the card of a node is the writing of the node.
   */
  const leaders = $derived.by(() => {
    const drawn: Array<{
      id: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: string;
    }> = [];

    for (const [id, card] of relationCardPositions) {
      const line = relationBadgePositions.get(id);

      if (line === undefined) {
        continue;
      }

      // The edge of the card that faces the line.
      const along = (card.x - line.x) * line.nx + (card.y - line.y) * line.ny;
      const side = along === 0 ? 1 : Math.sign(along);

      const relation = edges.find((edge) => edge.id === id);

      drawn.push({
        id,
        x1: line.x,
        y1: line.y,
        x2: card.x - line.nx * side * (card.height / 2),
        y2: card.y - line.ny * side * (card.height / 2),
        // The leader wears the **colour of the relation**: it is the line of
        // that relation that the card belongs to.
        color: relation === undefined ? '#9aa1ad' : edgeColor(relation.status)
      });
    }

    return drawn;
  });

  /** Whether two sets of positions are the same. */
  function samePositions(current: Map<string, RenderedBox>, next: Map<string, RenderedBox>): boolean {
    if (current.size !== next.size) {
      return false;
    }

    for (const [id, box] of current) {
      const other = next.get(id);

      if (other === undefined || other.x !== box.x || other.y !== box.y) {
        return false;
      }
    }

    return true;
  }

  /** Whether two sets of positions of relations are the same. */
  function sameRelationPositions(
    current: Map<string, RenderedRelation>,
    next: Map<string, RenderedRelation>
  ): boolean {
    if (current.size !== next.size) {
      return false;
    }

    for (const [id, box] of current) {
      const other = next.get(id);

      if (other === undefined || other.x !== box.x || other.y !== box.y) {
        return false;
      }
    }

    return true;
  }

  /** The badge of the node the user is over. */
  function showNodePreview(node: NodeDto, event?: MouseEvent | FocusEvent): void {
    showPreview('node', node.id, event);
  }

  /** The badge of the relation the user is over. */
  function showEdgePreview(edge: SubgraphEdgeDto, event?: MouseEvent | FocusEvent): void {
    showPreview('edge', edge.id, event);
  }

  /**
   * Opens the preview of a thing of the picture.
   *
   * The preview is placed where the pointer is: over the badge the user
   * reached for.
   */
  function showPreview(
    kind: 'node' | 'edge',
    id: string,
    event?: MouseEvent | FocusEvent
  ): void {
    const target = event?.currentTarget;

    if (target instanceof HTMLElement) {
      const bounds = target.getBoundingClientRect();
      const origin = container?.getBoundingClientRect();

      preview = {
        kind,
        id,
        x: (origin === undefined ? bounds.left : bounds.left - origin.left) + bounds.width / 2,
        y: (origin === undefined ? bounds.top : bounds.top - origin.top)
      };
      return;
    }

    preview = { kind, id, x: 0, y: 0 };
  }

  /** Closes the preview. */
  function hidePreview(): void {
    preview = null;
  }

  /** The node the preview shows. */
  const previewNode = $derived.by(() => {
    const current = preview;

    if (current === null || current.kind !== 'node') {
      return null;
    }

    return nodes.find((node) => node.id === current.id) ?? null;
  });

  /** The relation the preview shows. */
  const previewEdge = $derived.by(() => {
    const current = preview;

    if (current === null || current.kind !== 'edge') {
      return null;
    }

    return edges.find((edge) => edge.id === current.id) ?? null;
  });

  /** The title of a node of the window. */
  function titleOf(nodeId: string): string {
    return nodes.find((node) => node.id === nodeId)?.title ?? t('graph.unknownNode');
  }

  /**
   * The name of the type of a node, in the language of the interface.
   *
   * It is the **display name** of the class of the ontology: the card and
   * the preview say the same thing. The DTO carries the whole map of the
   * names and the client picks the one of its language.
   */
  function typeNameOf(node: NodeDto): string {
    return displayName(node.typeDisplayNames, locale.locale, node.typeKey);
  }

  /**
   * The name of the relation of an edge, in the language of the interface.
   *
   * The same rule as the class of a node: the display name of the property,
   * and the key of the system when the ontology does not know it.
   */
  function relationNameOf(edge: SubgraphEdgeDto): string {
    return displayName(edge.relationDisplayNames, locale.locale, edge.relationKey);
  }

  /** The attributes of the node of the preview. */
  const previewAttributes = $derived(
    previewNode === null ? [] : Object.entries(previewNode.attributes ?? {})
  );

  /**
   * The attributes of the relation of the preview.
   *
   * The window carries them: the preview shows the content of the relation
   * without asking the API for it.
   */
  const previewEdgeAttributes = $derived(
    previewEdge === null ? [] : Object.entries(previewEdge.attributes ?? {})
  );

  /** Moves the focus of the layer of the controls. */
  function moveFocus(event: KeyboardEvent, index: number): void {
    moveFocusOf(event, index, nodes.length, overlay, (next) => {
      activeIndex = next;
    });
  }

  /** Moves the focus of the layer of the controls of the relations. */
  function moveRelationFocus(event: KeyboardEvent, index: number): void {
    moveFocusOf(event, index, edges.length, relationOverlay, (next) => {
      activeRelationIndex = next;
    });
  }

  /**
   * Moves the focus inside a layer of buttons.
   *
   * The layer is a single stop in the tab order: the arrow keys move from
   * one button to the next, and the button they land on is the one that
   * takes the focus.
   */
  function moveFocusOf(
    event: KeyboardEvent,
    index: number,
    total: number,
    layer: HTMLElement | undefined,
    remember: (index: number) => void
  ): void {
    const last = total - 1;

    if (last < 0) {
      return;
    }

    let next = index;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = index === last ? 0 : index + 1;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = index === 0 ? last : index - 1;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = last;
    } else {
      return;
    }

    event.preventDefault();
    remember(next);
    layer?.querySelectorAll('button')[next]?.focus();
  }

  /** The node the layer of the controls starts on. */
  $effect(() => {
    const presented = presentedNodeId;

    if (presented === null) {
      return;
    }

    const index = nodes.findIndex((node) => node.id === presented);

    if (index >= 0) {
      activeIndex = index;
    }
  });

  const nodeCount = $derived(formatNumber(locale.locale, nodes.length));
  const edgeCount = $derived(formatNumber(locale.locale, edges.length));
</script>

<!--
  The picture is a picture: a screen reader cannot see it. The container
  therefore carries an accessible name and points at a short description, and
  the list below the canvas is the real alternative.

  The layer of the controls is a **sibling** of the canvas and not a child:
  a `role="img"` hides its own subtree from the reader, and the badges of the
  nodes have to be reachable with the keyboard.
-->
<div
  role="presentation"
  class="relative h-[60svh] min-h-72 w-full"
  onmouseleave={() => {
    // The pointer left the canvas: the badge of the relation it was over
    // goes away with it.
    hoveredEdgeId = null;
  }}
>
  <div
    bind:this={container}
    role="img"
    aria-label={t('explore.canvasLabel')}
    aria-describedby={descriptionId}
    class="h-full min-h-72 w-full overflow-hidden rounded-card bg-ground"
  ></div>

  <!--
    The leaders of the expanded relations: the line that joins the card of a
    relation to the relation itself.

    The card cannot stand on the line — it would cover the nodes the
    relation connects — so it is drawn beside it. The leader says which
    relation the card belongs to.
  -->
  <svg
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
  >
    {#each leaders as leader (leader.id)}
      <line
        x1={leader.x1}
        y1={leader.y1}
        x2={leader.x2}
        y2={leader.y2}
        stroke={leader.color}
        stroke-width="1"
        stroke-opacity="0.55"
      />
    {/each}
  </svg>

  <!--
    The badges of the nodes: the control that expands a node.

    They are real buttons over the picture, so the expansion is operable
    with the keyboard and announced. The layer is a toolbar with a single
    tab stop: the arrow keys move from one badge to the next.

    The **button** is the target and the **dot** is its face: on a touch
    device the target grows to forty-four pixels and the dot stays the size
    it is drawn at, so the badge does not cover the node it belongs to.
  -->
  <div
    bind:this={overlay}
    role="toolbar"
    aria-label={t('explore.badgesLabel')}
    aria-orientation="horizontal"
    class="pointer-events-none absolute inset-0 overflow-hidden"
  >
    {#each nodes as node, index (node.id)}
      {@const position = badgePositions.get(node.id)}
      {@const expanded = expandedIds.has(node.id)}
      {@const shown =
        hoveredNodeId === node.id ||
        focusedNodeId === node.id ||
        expanded ||
        presentedNodeId === node.id}
      {#if position !== undefined}
        <button
          type="button"
          tabindex={index === activeIndex ? 0 : -1}
          aria-pressed={expanded}
          aria-label={expanded
            ? t('explore.collapseBadge', { title: node.title })
            : t('explore.expandBadge', { title: node.title })}
          data-node-id={node.id}
          data-node-width={position.width}
          data-node-height={position.height}
          class="absolute grid h-4 w-4 pointer-coarse:h-11 pointer-coarse:w-11 -translate-x-1/2 -translate-y-1/2 place-items-center text-[10px] leading-none font-semibold text-text focus-visible:opacity-100 {shown ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}"
          style="left: {position.x + position.width / 2 + BADGE_GAP}px; top: {position.y -
            position.height / 2 - BADGE_GAP}px"
          onclick={() => toggleHandler?.(node.id)}
          onkeydown={(event) => moveFocus(event, index)}
          onmouseenter={(event) => {
            hoveredNodeId = node.id;
            showNodePreview(node, event);
          }}
          onmouseleave={() => {
            hoveredNodeId = null;
            hidePreview();
          }}
          onfocus={(event) => {
            focusedNodeId = node.id;
            showNodePreview(node, event);
          }}
          onblur={() => {
            focusedNodeId = null;
            hidePreview();
          }}
        >
          <span
            class="grid h-4 w-4 place-items-center rounded-full border border-control-strong bg-surface shadow-float hover:bg-raised"
          >
            {expanded ? '−' : '+'}
          </span>
        </button>
      {/if}
    {/each}
  </div>

  <!--
    The badges of the relations: the control that expands a relation.

    They are real buttons over the picture, like the badges of the nodes, and
    they live in a layer of their own: the badge of a relation is **on a
    line**, not on a card, and the two layers do not mix.

    The badge of a relation is a **square** and the badge of a node is a
    **circle**: the two controls are on the picture at the same time, and
    the reader must tell them apart without reading the label.

    The **button** is the target and the **square** is its face: on a touch
    device the target grows to forty-four pixels and the face stays the size
    it is drawn at.
  -->
  <div
    bind:this={relationOverlay}
    role="toolbar"
    aria-label={t('explore.relationBadgesLabel')}
    aria-orientation="horizontal"
    class="pointer-events-none absolute inset-0 overflow-hidden"
  >
    {#each edges as edge, index (edge.id)}
      {@const position = relationBadgePositions.get(edge.id)}
      {@const expanded = expandedEdgeIds.has(edge.id)}
      {@const shown =
        hoveredEdgeId === edge.id ||
        focusedEdgeId === edge.id ||
        expanded ||
        selectedEdgeId === edge.id}
      {#if position !== undefined}
        <button
          type="button"
          tabindex={index === activeRelationIndex ? 0 : -1}
          aria-pressed={expanded}
          aria-label={expanded
            ? t('explore.collapseRelationBadge', { name: relationNameOf(edge) })
            : t('explore.expandRelationBadge', { name: relationNameOf(edge) })}
          data-edge-id={edge.id}
          class="absolute grid h-4 w-4 pointer-coarse:h-11 pointer-coarse:w-11 -translate-x-1/2 -translate-y-1/2 place-items-center text-[10px] leading-none font-semibold text-text focus-visible:opacity-100 {shown ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}"
          style="left: {position.x + position.nx * RELATION_BADGE_GAP}px; top: {position.y +
            position.ny * RELATION_BADGE_GAP}px"
          onclick={() => toggleEdgeHandler?.(edge.id)}
          onkeydown={(event) => moveRelationFocus(event, index)}
          onmouseenter={(event) => {
            hoveredEdgeId = edge.id;
            showEdgePreview(edge, event);
          }}
          onmouseleave={() => {
            hoveredEdgeId = null;
            hidePreview();
          }}
          onfocus={(event) => {
            focusedEdgeId = edge.id;
            showEdgePreview(edge, event);
          }}
          onblur={() => {
            focusedEdgeId = null;
            hidePreview();
          }}
        >
          <span
            class="grid h-4 w-4 place-items-center rounded-[3px] border border-control-strong bg-surface shadow-float hover:bg-raised"
          >
            {expanded ? '−' : '≡'}
          </span>
        </button>
      {/if}
    {/each}
  </div>

  <!--
    The preview: what the pointer is over, temporarily.

    It is a live region: the content of the node or of the relation is
    announced when it appears, and it disappears with the pointer.
  -->
  {#if preview !== null}
    <div
      role="status"
      aria-live="polite"
      class="pointer-events-none absolute z-10 w-56 rounded-card bg-surface p-3 text-small shadow-float"
      style="left: {Math.min(preview.x + 12, Math.max(0, (container?.clientWidth ?? 0) - 268))}px; top: {preview.y +
        12}px"
    >
      {#if previewNode !== null}
        <p class="font-semibold">{previewNode.title}</p>
        <p class="mt-0.5 text-muted">
          {typeNameOf(previewNode)} · {locale.status('node', previewNode.status)}
        </p>
        <p class="mt-2 whitespace-pre-line">
          {previewNode.description?.trim() !== ''
            ? previewNode.description
            : t('explore.previewNoDescription')}
        </p>
        {#if previewAttributes.length > 0}
          <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
            {#each previewAttributes as [key, value] (key)}
              <dt class="font-medium">{key}</dt>
              <dd class="text-muted">{formatAttributeValue(value)}</dd>
            {/each}
          </dl>
        {:else}
          <p class="mt-2 text-muted">{t('explore.previewNoAttributes')}</p>
        {/if}
      {:else if previewEdge !== null}
        <p class="font-semibold">{relationNameOf(previewEdge)}</p>
        <p class="mt-0.5 text-muted">
          {t('explore.previewEndpoints', {
            source: titleOf(previewEdge.sourceNodeId),
            target: titleOf(previewEdge.targetNodeId)
          })}
        </p>
        <p class="mt-2 text-muted">
          {locale.status('edge', previewEdge.status)} · {t('explore.previewScore', {
            score: formatNumber(locale.locale, previewEdge.communityScore)
          })}
        </p>

        <!--
          The content of the relation: the window carries it, so the
          preview shows it without asking the API for it.
        -->
        {#if previewEdgeAttributes.length > 0}
          <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
            {#each previewEdgeAttributes as [key, value] (key)}
              <dt class="font-medium">{key}</dt>
              <dd class="text-muted">{formatAttributeValue(value)}</dd>
            {/each}
          </dl>
        {:else}
          <p class="mt-2 text-muted">{t('explore.previewNoAttributes')}</p>
        {/if}

        <p class="mt-2 text-muted">
          {t('inspector.author')}: {shortPseudonym(previewEdge.authorHash)}
        </p>
        <p class="text-muted">
          {t('inspector.created')}: {formatDate(locale.locale, previewEdge.createdAt)}
        </p>
      {/if}
    </div>
  {/if}
</div>

<p id={descriptionId} class="mt-2 text-body text-muted">
  {t('explore.canvasDescription', { nodes: nodeCount, edges: edgeCount })}
</p>
