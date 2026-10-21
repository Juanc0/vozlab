<script lang="ts">
  import type { Position } from 'cytoscape';
  import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
  import type { EdgeStyle } from '$lib/graph/explore/edge-style';
  import type { ExplorationInstance, RenderedBox } from '$lib/graph/explore/instance';
  import { formatAttributeValue } from '$lib/graph/elements';
  import { formatNumber } from '$lib/i18n';
  import { getLocaleState } from '$lib/state/context';

  interface Props {
    /** The nodes of the exploration window. */
    nodes?: NodeDto[];
    /** The relations of the exploration window. */
    edges?: SubgraphEdgeDto[];
    /** The nodes that are drawn as a card. */
    expandedIds?: ReadonlySet<string>;
    /** The shape the relations are drawn with. */
    edgeStyle?: EdgeStyle;
    /** The id of the selected node, or `null` when nothing is selected. */
    selectedNodeId?: string | null;
    /** The id of the node the view presents. */
    presentedNodeId?: string | null;
    /** Called when the user selects (or clears) a node in the canvas. */
    onselect?: (nodeId: string | null) => void;
    /** Called when the user expands or collapses a node. */
    ontoggle?: (nodeId: string) => void;
  }

  let {
    nodes = [],
    edges = [],
    expandedIds = new Set<string>(),
    edgeStyle = 'bezier',
    selectedNodeId = null,
    presentedNodeId = null,
    onselect,
    ontoggle
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

  let container: HTMLDivElement | undefined = $state();
  let overlay: HTMLDivElement | undefined = $state();

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

  /**
   * The last positions the badges were moved to.
   *
   * It is **not** reactive on purpose: the effect that patches the elements
   * moves the badges, and if it read the reactive state the badges would
   * depend on the elements — the layout would run again on every frame of a
   * drag, and the dragged node would be destroyed by its own layout.
   */
  let lastPositions = new Map<string, RenderedBox>();

  /** The badge that is in the tab order of the layer of the controls. */
  let activeIndex = $state(0);

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
   * The callbacks are read through holders.
   *
   * The parent passes a new closure on every render; reading the prop inside
   * the effect that creates the instance would re-create the canvas on every
   * render of the parent. The holder breaks that dependency.
   */
  let selectHandler: ((nodeId: string | null) => void) | undefined;
  let toggleHandler: ((nodeId: string) => void) | undefined;

  $effect(() => {
    selectHandler = onselect;
    toggleHandler = ontoggle;
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
    void import('$lib/graph/explore/instance').then(({ createExplorationInstance }) => {
      if (cancelled) {
        return;
      }

      created = createExplorationInstance({
        container: element,
        onselect: (nodeId) => selectHandler?.(nodeId),
        onpreview: (next, related) => {
          preview = next;

          if (next !== null) {
            if (next.kind === 'node') {
              hoveredNodeId = next.id;
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
          }
        }
      });

      instance = created;
    });

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
    const currentStyle = edgeStyle;
    const currentPresented = presentedNodeId;

    if (graph === null) {
      return;
    }

    graph.setElements(currentNodes, currentEdges, {
      expandedIds: currentExpanded,
      edgeStyle: currentStyle,
      presentedNodeId: currentPresented,
      pinned
    });

    moveBadges(graph.positions());
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

  /** The badge of the node the user is over. */
  function showNodePreview(node: NodeDto, event?: MouseEvent | FocusEvent): void {
    const target = event?.currentTarget;

    if (target instanceof HTMLElement) {
      const bounds = target.getBoundingClientRect();
      const origin = container?.getBoundingClientRect();

      preview = {
        kind: 'node',
        id: node.id,
        x: (origin === undefined ? bounds.left : bounds.left - origin.left) + bounds.width / 2,
        y: (origin === undefined ? bounds.top : bounds.top - origin.top)
      };
      return;
    }

    preview = { kind: 'node', id: node.id, x: 0, y: 0 };
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

  /** The attributes of the node of the preview. */
  const previewAttributes = $derived(
    previewNode === null ? [] : Object.entries(previewNode.attributes ?? {})
  );

  /** Moves the focus of the layer of the controls. */
  function moveFocus(event: KeyboardEvent, index: number): void {
    const last = nodes.length - 1;

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
    activeIndex = next;
    overlay?.querySelectorAll('button')[next]?.focus();
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
<div class="relative h-[60svh] min-h-72 w-full">
  <div
    bind:this={container}
    role="img"
    aria-label={t('explore.canvasLabel')}
    aria-describedby={descriptionId}
    class="h-full min-h-72 w-full overflow-hidden rounded-card bg-surface"
  ></div>

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
          class="absolute grid h-4 w-4 -translate-x-1/2 -translate-y-1/2 place-items-center text-[10px] leading-none font-semibold text-text focus-visible:opacity-100 {shown ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}"
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
        <p class="mt-0.5 text-muted">{previewNode.typeKey} · {previewNode.status}</p>
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
        <p class="font-semibold">{previewEdge.relationKey}</p>
        <p class="mt-0.5 text-muted">
          {t('explore.previewEndpoints', {
            source: titleOf(previewEdge.sourceNodeId),
            target: titleOf(previewEdge.targetNodeId)
          })}
        </p>
        <p class="mt-2 text-muted">
          {previewEdge.status} · {t('explore.previewScore', {
            score: formatNumber(locale.locale, previewEdge.communityScore)
          })}
        </p>
      {/if}
    </div>
  {/if}
</div>

<p id={descriptionId} class="mt-2 text-body text-muted">
  {t('explore.canvasDescription', { nodes: nodeCount, edges: edgeCount })}
</p>
