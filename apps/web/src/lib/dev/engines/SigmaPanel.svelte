<script lang="ts">
  /**
   * The **panel of Sigma.js** — the third engine of the comparison.
   *
   * It draws the same picture as the two panels of Cytoscape: the same
   * nodes, the same relations, the same cards, the same interactions. What
   * it does **not** have is a way of drawing them the way Cytoscape does,
   * and that is what the comparison is for:
   *
   * - the **title inside the card**: Sigma has no multi-line label inside a
   *   node shape — its labels are a layer of their own and a layer draws
   *   one line — so the card is a **picture**: a rounded rectangle with the
   *   title written inside it, painted on a two-dimensional layer above the
   *   WebGL canvas. The picture is built by the pure module of the card, so
   *   the title is wrapped in the same lines as in Cytoscape;
   * - the **spring**: the picture is arranged by the ForceAtlas2 layout of
   *   Graphology, driven one iteration per frame, and it stops as soon as
   *   the picture stops moving.
   *
   * The module is **dev-only**: it belongs to the comparison of the engines.
   */
  import { onMount } from 'svelte';
  import Graph from 'graphology';
  import Sigma from 'sigma';
  import { EdgeArrowProgram } from 'sigma/rendering';
  import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
  import type { EdgeStyle } from '$lib/graph/explore/edge-style';
  import { edgeColor } from '$lib/graph/elements';
  import { countOverlappingPairs } from '$lib/graph/explore/force-layout';
  import { displayName } from '$lib/i18n/display-name';
  import { formatDate, formatNumber } from '$lib/i18n';
  import { shortPseudonym } from '$lib/graph/relation-card';
  import { getLocaleState } from '$lib/state/context';
  import { cardTextureFor, paintCard, type CardTexture } from './card-texture';
  import { fillSigmaGraph } from './sigma-graph';
  import { createSpring, normalizePicture, type Spring } from './spring';

  interface Props {
    /** The nodes of the picture. */
    nodes?: NodeDto[];
    /** The relations of the picture. */
    edges?: SubgraphEdgeDto[];
    /** The nodes that are drawn with their whole content. */
    expandedIds?: ReadonlySet<string>;
    /** The id of the selected node. */
    selectedNodeId?: string | null;
    /** The id of the node the view presents. */
    presentedNodeId?: string | null;
    /** The shape the relations are drawn with. */
    edgeStyle?: EdgeStyle;
    /** Called when the user selects a node. */
    onselect?: (nodeId: string | null) => void;
    /** Called when the user expands or collapses a node. */
    ontoggle?: (nodeId: string) => void;
    /** Called when the spring has settled. */
    onsettled?: (report: {
      readonly ms: number;
      readonly iterations: number;
      readonly overlaps: number;
    }) => void;
    /** Called with the element the panel is drawn in, for the measurements. */
    oncontainer?: (element: HTMLElement | undefined) => void;
    /** Called when the panel could not be drawn. */
    onerror?: (message: string) => void;
    /**
     * The accessible name of the picture.
     *
     * The default is the name of the comparison. The three pictures of the
     * comparison are on the screen at the same time, and each one needs a
     * name of its own.
     */
    label?: string;
    /**
     * The smallest zoom the picture is fitted to.
     *
     * The default is the zoom in which the title of a card can be read.
     */
    readableScale?: number;
  }

  /**
   * The zoom in which the title of a card can still be read.
   *
   * It is the same rule as the canvas of Cytoscape (`MIN_READABLE_ZOOM`):
   * the picture is fitted to the window, and it is never zoomed out past
   * the zoom in which a card is a card and not a dot.
   */
  const MIN_READABLE_SCALE = 0.75;

  /**
   * The length a relation of the picture has, in the units of the graph.
   *
   * It is a card and a half: the cards do not lie on top of each other and
   * the picture does not spread over the whole world.
   */
  const CARD_SPACING = 210;

  let {
    nodes = [],
    edges = [],
    expandedIds = new Set<string>(),
    selectedNodeId = null,
    presentedNodeId = null,
    edgeStyle = 'bezier',
    onselect,
    ontoggle,
    onsettled,
    oncontainer,
    onerror,
    readableScale = MIN_READABLE_SCALE,
    label = undefined
  }: Props = $props();

  const locale = getLocaleState();
  const t = locale.t;

  /** The distance between the badge of a node and the corner of its card. */
  const BADGE_GAP = 6;

  let container: HTMLDivElement | undefined = $state();
  let stage: HTMLDivElement | undefined = $state();
  let overlay: HTMLCanvasElement | undefined = $state();

  /** The instance of Sigma. It is an opaque object: it is not reactive. */
  let sigma: Sigma | null = null;

  /** The graph of Graphology: the store of the picture. */
  let graph: Graph | null = null;

  /** The spring that arranges the picture. */
  let spring: Spring | null = null;

  /** The places the user put the dragged nodes in. */
  const pinned = new Map<string, { x: number; y: number }>();

  /** The picture of every card. */
  let textures = new Map<string, CardTexture>();

  /** Where every card is drawn, in the pixels of the panel. */
  let badgePositions = $state.raw<Map<string, { x: number; y: number; width: number; height: number }>>(
    new Map()
  );

  /** What the pointer is over. */
  let hoveredNodeId = $state<string | null>(null);
  let focusedNodeId = $state<string | null>(null);
  let preview = $state<{ id: string; x: number; y: number } | null>(null);

  /** The node the user is dragging. */
  let dragging: { id: string; dx: number; dy: number } | null = null;

  /**
   * Whether the picture has been fitted to the panel.
   *
   * The picture is fitted the first time it is drawn, and **only** then: a
   * layout that runs again must not move the picture under the reader's
   * feet, and the place the reader dragged a node to must stay.
   */
  let fitted = false;

  /**
   * Whether the picture holds the same nodes as the ones it held.
   *
   * @param current - The nodes of the picture.
   * @returns Whether the window itself changed.
   */
  function sameNodes(current: readonly NodeDto[]): boolean {
    if (nodes.length !== current.length) {
      return false;
    }

    const ids = new Set(nodes.map((node) => node.id));

    return current.every((node) => ids.has(node.id));
  }

  /** The badge that is in the tab order of the layer of the controls. */
  let activeIndex = $state(0);

  /**
   * The nodes that are **not** drawn: the panel shows the same nodes as the
   * other two, and the graph of Graphology holds exactly them.
   */
  const graphNodes = $derived(nodes);
  const graphEdges = $derived(edges);

  /** The node the preview shows. */
  const previewNode = $derived.by(() => {
    const current = preview;

    if (current === null) {
      return null;
    }

    return nodes.find((node) => node.id === current.id) ?? null;
  });

  /** The attributes of the node of the preview. */
  const previewAttributes = $derived(
    previewNode === null ? [] : Object.entries(previewNode.attributes ?? {})
  );

  /** The name of the type of a node, in the language of the interface. */
  function typeNameOf(node: NodeDto): string {
    return displayName(node.typeDisplayNames, locale.locale, node.typeKey);
  }

  onMount(() => {
    oncontainer?.(container);

    return () => {
      oncontainer?.(undefined);
    };
  });

  /**
   * Creates the instance of Sigma **once** and destroys it on unmount.
   *
   * The module is imported here so the server pass never evaluates it: both
   * the library and the WebGL context belong to the browser.
   */
  $effect(() => {
    const element = stage;

    if (element === undefined) {
      return;
    }

    let created: Sigma | null = null;
    let cancelled = false;

    try {
      const store = new Graph({ type: 'mixed', multi: false, allowSelfLoops: true });
      graph = store;

      created = new Sigma(store, element, {
        // The labels of the nodes are the **cards**: they are painted by the
        // layer of the picture, and Sigma's own label layer is not used.
        renderLabels: false,
        // The name of a relation is a phrase: Sigma draws it in the middle
        // of the line, in the muted ink.
        renderEdgeLabels: true,
        edgeLabelFont: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
        edgeLabelSize: 11,
        edgeLabelWeight: '400',
        edgeLabelColor: { color: '#5f6672' },
        // The relations are drawn with the program of the **arrow**: a line
        // with a head, the same shape the canvas of Cytoscape draws.
        edgeProgramClasses: { arrow: EdgeArrowProgram },
        // The picture is not fitted by the renderer: the panel fits it
        // itself, and it keeps the viewport where the reader left it.
        autoRescale: true,
        autoCenter: false,
        zIndex: true,
        minCameraRatio: 0.02,
        maxCameraRatio: 12,
        allowInvalidContainer: false
      });

      sigma = created;

      // The picture is painted again whenever the camera moves: the cards
      // are on a layer of their own, above the WebGL canvas.
      created.on('afterRender', () => {
        paint();
      });
    } catch (caught) {
      // A browser without WebGL leaves the panel empty: the reader is told
      // what happened instead of facing a blank space.
      onerror?.(
        caught instanceof Error ? caught.message : t('engines.sigmaUnavailable')
      );
      return;
    }

    return () => {
      cancelled = true;

      if (cancelled) {
        created?.kill();
      }

      sigma = null;
      graph = null;
      spring = null;
    };
  });

  /**
   * Fills the graph of Graphology and arranges the picture again.
   *
   * The three panels get the **same** nodes and the same relations: the
   * graph is emptied and filled again, and the spring runs from the places
   * the nodes had, so the picture rearranges around them.
   */
  $effect(() => {
    const store = graph;
    const instance = sigma;
    const currentNodes = graphNodes;
    const currentEdges = graphEdges;

    if (store === null || instance === null) {
      return;
    }

    // The picture of the cards: the pure module of the card, the same
    // measurer and the same wrapping as the canvas of Cytoscape.
    const next = new Map<string, CardTexture>();

    for (const node of currentNodes) {
      next.set(node.id, cardTextureFor(node, { locale: locale.locale }));
    }

    textures = next;

    // The graph of Graphology: the same ids the other two panels get.
    fillSigmaGraph(store, currentNodes, currentEdges, {
      locale: locale.locale,
      pinned
    });

    // The picture is fitted again only when the window itself changed: a
    // layout that runs because a node grew keeps the viewport, and the
    // place the reader dragged a node to is still there.
    if (!sameNodes(currentNodes)) {
      fitted = false;
    }

    instance.refresh();

    // The picture is arranged again: the spring runs from the places the
    // nodes have, and it stops when the picture stops moving.
    void runSpring();
  });

  /**
   * Runs the spring and paints the picture while it runs.
   *
   * The simulation is **stepped**: one iteration per frame, so the reader
   * sees the picture find its place, and it stops as soon as the picture
   * stops moving.
   */
  async function runSpring(): Promise<void> {
    const store = graph;
    const instance = sigma;

    if (store === null || instance === null) {
      return;
    }

    spring?.stop();

    const next = createSpring(store);
    spring = next;

    const report = await next.run(() => {
      instance.refresh();
      paint();
    });

    // The scale of a force layout is arbitrary: the picture is normalised
    // so that a relation is as long as a card and a half, and the cards
    // do not lie on top of each other.
    normalizePicture(store, CARD_SPACING);

    instance.refresh();

    // The picture is fitted once the spring has settled: the force layout
    // spreads the nodes over a wide area, and the picture has to be seen.
    // And it is fitted **once**: a layout that runs again keeps the
    // viewport where the reader left it.
    if (!fitted) {
      await fitPicture();
      fitted = true;
    }

    paint();

    // The pairs of cards that lie on top of each other: the metric that
    // tells the truth about a force layout.
    const boxes = [...badgePositions.values()].map((badge) => ({
      x: badge.x - badge.width / 2,
      y: badge.y + badge.height / 2,
      width: badge.width,
      height: badge.height
    }));

    onsettled?.({
      ms: report.ms,
      iterations: report.iterations,
      overlaps: countOverlappingPairs(boxes)
    });
  }

  /**
   * The scale between the coordinates of the graph and the pixels of the
   * panel.
   *
   * It is measured with two points, because the camera of Sigma knows how
   * it draws and does not say how much a graph unit is worth.
   */
  function graphScale(): number {
    const instance = sigma;

    if (instance === null) {
      return 1;
    }

    const origin = instance.graphToViewport({ x: 0, y: 0 });
    const unit = instance.graphToViewport({ x: 100, y: 0 });

    return Math.hypot(unit.x - origin.x, unit.y - origin.y) / 100;
  }

  /**
   * Fits the picture to the panel.
   *
   * The rule is the one of the canvas of Cytoscape: the picture is fitted
   * to the window, and it is never zoomed out past the zoom in which the
   * title of a card can be **read** — a card whose title cannot be read is
   * not a card.
   *
   * The camera of Sigma knows the centre of the graph in its own
   * coordinates (`0.5, 0.5`): the picture is centred there first, and the
   * zoom is the one that makes the cards readable.
   *
   * The zoom is measured **after** the picture has been drawn with the
   * centred camera: the renderer keeps the matrix of the last picture, and
   * a measure taken before it is a measure of the picture before.
   */
  async function fitPicture(): Promise<void> {
    const instance = sigma;

    if (instance === null) {
      return;
    }

    const camera = instance.getCamera();

    // The picture is centred first: the camera of Sigma knows the centre
    // of the graph in its own coordinates (`0.5, 0.5`).
    camera.setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 });
    instance.refresh();
    await nextPicture(instance);

    const scale = graphScale();

    if (!Number.isFinite(scale) || scale <= 0) {
      return;
    }

    // The zoom is the one in which the cards can be read — and the picture
    // is never zoomed out past it.
    const wanted = Math.max(scale, readableScale);

    if (Math.abs(wanted - scale) < 0.001) {
      paint();
      return;
    }

    // The relation between the zoom of the camera and the size of the
    // picture is **measured**, not assumed: the camera is moved once, the
    // picture is measured again, and the zoom that gives the wanted size
    // is computed from the two measures.
    const probe = 0.5;

    camera.setState({ x: 0.5, y: 0.5, ratio: probe, angle: 0 });
    instance.refresh();
    await nextPicture(instance);

    const probed = graphScale();

    if (!Number.isFinite(probed) || probed <= 0) {
      return;
    }

    // The exponent of the zoom: the size of the picture follows the zoom
    // of the camera as a power.
    const exponent = Math.log(probed / scale) / Math.log(probe);

    if (!Number.isFinite(exponent) || Math.abs(exponent) < 0.01) {
      return;
    }

    const ratio = Math.pow(wanted / scale, 1 / exponent);

    if (!Number.isFinite(ratio) || ratio <= 0) {
      return;
    }

    camera.setState({ x: 0.5, y: 0.5, ratio, angle: 0 });
    instance.refresh();
    await nextPicture(instance);

    paint();
  }

  /**
   * Waits for the renderer to draw the picture.
   *
   * The renderer keeps the matrix of the last picture, and a measure taken
   * before it is a measure of the picture before. The wait is **two
   * frames**: the first one draws the picture, the second one is the frame
   * in which the matrix is the new one.
   *
   * @param instance - The instance of Sigma.
   * @returns A promise that answers when the picture is on the canvas.
   */
  function nextPicture(instance: Sigma): Promise<void> {
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void instance;
          resolve();
        });
      });
    });
  }

  /** The place of a card in the pixels of the panel. */
  function cardPlace(id: string): { x: number; y: number } | null {
    const instance = sigma;
    const store = graph;

    if (instance === null || store === null || !store.hasNode(id)) {
      return null;
    }

    const attributes = store.getNodeAttributes(id);
    const place = instance.graphToViewport({ x: Number(attributes['x']), y: Number(attributes['y']) });

    return { x: place.x, y: place.y };
  }

  /**
   * Paints the layer of the picture: the cards and the relations that
   * cannot be drawn by the WebGL renderer.
   *
   * The layer is painted in the coordinates of the **graph**: the cards
   * scale with the camera exactly like the cards of Cytoscape.
   */
  function paint(): void {
    const canvas = overlay;
    const instance = sigma;
    const store = graph;

    if (canvas === undefined || instance === null || store === null) {
      return;
    }

    const context = canvas.getContext('2d');

    if (context === null) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const scale = graphScale();

    // The cards.
    const places = new Map<string, { x: number; y: number }>();

    for (const node of nodes) {
      const texture = textures.get(node.id);
      const place = cardPlace(node.id);

      if (texture === undefined || place === null) {
        continue;
      }

      places.set(node.id, place);

      context.save();
      context.translate(place.x, place.y);
      context.scale(scale, scale);

      paintCard(context, texture, {
        selected: node.id === selectedNodeId,
        presented: node.id === presentedNodeId
      });

      context.restore();
    }

    // The badges follow the cards.
    const nextBadges = new Map<string, { x: number; y: number; width: number; height: number }>();

    for (const [id, place] of places) {
      const texture = textures.get(id);

      if (texture === undefined) {
        continue;
      }

      nextBadges.set(id, {
        x: place.x + (texture.width * scale) / 2,
        y: place.y - (texture.height * scale) / 2,
        width: texture.width * scale,
        height: texture.height * scale
      });
    }

    badgePositions = nextBadges;
  }

  /**
   * The node whose card is under a point of the panel.
   *
   * The hit test is a **rectangle**: the card is a rectangle, and a circle
   * would leave its corners out of reach.
   */
  function nodeAt(x: number, y: number): string | null {
    const store = graph;

    if (store === null) {
      return null;
    }

    const scale = graphScale();

    for (const node of nodes) {
      const texture = textures.get(node.id);
      const place = cardPlace(node.id);

      if (texture === undefined || place === null) {
        continue;
      }

      const halfWidth = (texture.width * scale) / 2;
      const halfHeight = (texture.height * scale) / 2;

      if (
        x >= place.x - halfWidth &&
        x <= place.x + halfWidth &&
        y >= place.y - halfHeight &&
        y <= place.y + halfHeight
      ) {
        return node.id;
      }
    }

    return null;
  }

  /** The point of the panel under the pointer. */
  function pointerPlace(event: MouseEvent): { x: number; y: number } {
    const bounds = container?.getBoundingClientRect();

    return {
      x: event.clientX - (bounds?.left ?? 0),
      y: event.clientY - (bounds?.top ?? 0)
    };
  }

  /** The pointer moved over the picture. */
  function handleMove(event: MouseEvent): void {
    const place = pointerPlace(event);

    if (dragging !== null) {
      const instance = sigma;

      if (instance === null || graph === null) {
        return;
      }

      const graphPlace = instance.viewportToGraph(place);
      const attributes = graph.getNodeAttributes(dragging.id);

      graph.setNodeAttribute(dragging.id, 'x', graphPlace.x + dragging.dx);
      graph.setNodeAttribute(dragging.id, 'y', graphPlace.y + dragging.dy);

      pinned.set(dragging.id, {
        x: graphPlace.x + dragging.dx,
        y: graphPlace.y + dragging.dy
      });

      instance.refresh();
      paint();

      return;
    }

    const node = nodeAt(place.x, place.y);

    if (node === null) {
      hoveredNodeId = null;
      preview = null;
      return;
    }

    hoveredNodeId = node;
    preview = { id: node, x: place.x, y: place.y };
  }

  /**
   * The pointer went down on a card: the card is dragged.
   *
   * The captor of the camera is switched off while the card is dragged: a
   * drag that panned the picture at the same time would move the card away
   * from under the pointer.
   */
  function handleDown(event: MouseEvent): void {
    const place = pointerPlace(event);
    const node = nodeAt(place.x, place.y);

    if (node === null || sigma === null || graph === null) {
      return;
    }

    const card = cardPlace(node);

    if (card === null) {
      return;
    }

    const graphPlace = sigma.viewportToGraph(place);
    const attributes = graph.getNodeAttributes(node);

    dragging = {
      id: node,
      dx: Number(attributes['x']) - graphPlace.x,
      dy: Number(attributes['y']) - graphPlace.y
    };

    sigma.getMouseCaptor().enabled = false;
    event.preventDefault();
  }

  /** The pointer came up: the card keeps the place it was put. */
  function handleUp(): void {
    if (dragging === null) {
      return;
    }

    dragging = null;

    if (sigma !== null) {
      sigma.getMouseCaptor().enabled = true;
    }
  }

  /** The pointer left the picture. */
  function handleLeave(): void {
    hoveredNodeId = null;
    preview = null;
    handleUp();
  }

  /**
   * The picture was clicked: the node under the pointer is selected.
   *
   * The hit test is the one of the cards: a rectangle, and not the circle
   * the renderer picks with.
   */
  function handleClick(event: MouseEvent): void {
    const place = pointerPlace(event);
    const node = nodeAt(place.x, place.y);

    onselect?.(node);
  }

  /** The picture is resized. */
  $effect(() => {
    const element = stage;

    if (element === undefined) {
      return;
    }

    const observer = new ResizeObserver(() => {
      sigma?.resize();
      paint();
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  });

  /** The selected node and the presented one are painted again. */
  $effect(() => {
    const selected = selectedNodeId;
    const presented = presentedNodeId;

    // The effect reads the two ids so the picture is painted again when
    // they change.
    void selected;
    void presented;

    paint();
  });
</script>

<!--
  The panel: the picture of Sigma (the WebGL canvas and the layers of the
  labels) and the layer of the picture above it, where the cards are.
-->
<div
  bind:this={container}
  role="presentation"
  class="relative h-full w-full overflow-hidden bg-ground"
  onmousemove={handleMove}
  onmousedowncapture={handleDown}
  onmouseup={handleUp}
  onmouseleave={handleLeave}
  onclick={handleClick}
>
  <!--
    The picture: a canvas is a picture a screen reader cannot see, so it
    carries an accessible name and the description of the comparison. The
    badges of the nodes are **outside** of it: a `role="img"` hides its
    own subtree from the reader, and the badges have to be reachable with
    the keyboard.
  -->
  <div
    role="img"
    aria-label={label ?? t('engines.canvasLabel')}
    class="absolute inset-0"
  >
    <div bind:this={stage} class="absolute inset-0"></div>

    <!--
      The layer of the picture: the cards of the nodes and the relations
      with right angles. It never takes the pointer: the panel handles it.
    -->
    <canvas
      bind:this={overlay}
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 h-full w-full"
    ></canvas>
  </div>

  <!--
    The badges of the nodes: the control that expands a node. They are
    real buttons over the picture, so the expansion is operable with the
    keyboard and announced.
  -->
  <div
    role="toolbar"
    aria-label={t('engines.badgesLabel')}
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
          class="absolute grid h-4 w-4 pointer-coarse:h-11 pointer-coarse:w-11 -translate-x-1/2 -translate-y-1/2 place-items-center text-[10px] leading-none font-semibold text-text focus-visible:opacity-100 {shown
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'}"
          style="left: {position.x + BADGE_GAP}px; top: {position.y - BADGE_GAP}px"
          onclick={() => ontoggle?.(node.id)}
          onfocus={() => {
            focusedNodeId = node.id;
          }}
          onblur={() => {
            focusedNodeId = null;
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
    The preview: what the pointer is over, temporarily. It is a live
    region: the content of the node is announced when it appears.
  -->
  {#if preview !== null && previewNode !== null}
    <div
      role="status"
      aria-live="polite"
      class="pointer-events-none absolute z-10 w-56 rounded-card bg-surface p-3 text-small shadow-float"
      style="left: {Math.min(preview.x + 12, Math.max(0, (container?.clientWidth ?? 0) - 268))}px; top: {preview.y +
        12}px"
    >
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
            <dd class="text-muted">{String(value)}</dd>
          {/each}
        </dl>
      {:else}
        <p class="mt-2 text-muted">{t('explore.previewNoAttributes')}</p>
      {/if}
      <p class="mt-2 text-muted">
        {t('inspector.author')}: {shortPseudonym(previewNode.authorHash)}
      </p>
      <p class="text-muted">
        {t('inspector.created')}: {formatDate(locale.locale, previewNode.createdAt)}
      </p>
      <p class="text-muted">
        {t('explore.previewScore', { score: formatNumber(locale.locale, previewNode.communityScore) })}
      </p>
    </div>
  {/if}
</div>
