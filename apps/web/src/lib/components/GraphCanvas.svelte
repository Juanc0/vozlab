<script lang="ts">
  import { untrack } from 'svelte';
  import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
  import type { ZoomAction, ZoomSource } from '$lib/graph/explore/zoom';
  import type { GraphInstance } from '$lib/graph/cytoscape';
  import { ensureTitleFont } from '$lib/graph/node-card';
  import { getLocaleState } from '$lib/state/context';

  interface Props {
    /** The nodes of the bounded subgraph. */
    nodes?: NodeDto[];
    /** The relations of the bounded subgraph. */
    edges?: SubgraphEdgeDto[];
    /** The id of the selected node, or `null` when nothing is selected. */
    selectedNodeId?: string | null;
    /**
     * The id of the node the view centres on when the picture does not fit.
     *
     * It is the root of the subgraph: the card of the node the reader chose
     * is the one that has to be readable.
     */
    rootNodeId?: string | null;
    /** Called when the user selects (or clears) a node in the canvas. */
    onselect?: (nodeId: string | null) => void;
    /**
     * Called when the user **walks** to a node of the canvas.
     *
     * A tap on a node is two things at once: it selects the node and it
     * walks to it — in the subgraph view, a walk re-roots the subgraph on
     * the node that was tapped.
     */
    onnavigate?: (nodeId: string) => void;
    /**
     * The node the picture is centred on.
     *
     * It is set when a walk lands: the picture has just been drawn again,
     * and the node the reader walked to is the one that has to be in the
     * middle of it.
     */
    centerNodeId?: string | null;
    /**
     * The number of times the picture asked to be centred.
     *
     * The counter is what tells the canvas that the picture has been drawn
     * again: the same node can be walked to twice, and the second walk has
     * to centre the new picture, not the old one.
     */
    centerRequest?: number;
    /** The text alternative of the canvas. */
    description?: string;
    /**
     * The zoom the reader had when the view was opened.
     *
     * It is `null` when the reader never chose one: the picture is then
     * fitted — the whole graph in view — and the fit is the zoom that
     * picture starts with.
     *
     * The value is read **once**, when the canvas is created: the zoom
     * belongs to the reader, and a new subgraph must not impose it again.
     */
    zoom?: number | null;
    /**
     * Called when the zoom of the picture changes.
     *
     * The app keeps the value: the zoom survives the change of the view of
     * the graph — the two views are the same workspace.
     */
    onzoomchange?: (zoom: number, source: ZoomSource) => void;
    /** What the reader asked the zoom to do. */
    zoomaction?: ZoomAction;
    /**
     * The number of the command of the zoom.
     *
     * It is a counter, and it is what tells a command from the one before
     * it: the reader may ask for the same thing twice.
     */
    zoomrequest?: number;
  }

  let {
    nodes = [],
    edges = [],
    selectedNodeId = null,
    rootNodeId = null,
    onselect,
    onnavigate,
    centerNodeId = null,
    centerRequest = 0,
    description,
    zoom = null,
    onzoomchange,
    zoomaction = 'in',
    zoomrequest = 0
  }: Props = $props();

  const locale = getLocaleState();
  const t = locale.t;

  const uid = $props.id();
  const descriptionId = `graph-canvas-description-${uid}`;

  let container: HTMLDivElement | undefined = $state();
  // `$state.raw`: the Cytoscape instance is an opaque object, it must not be
  // wrapped in a reactive proxy.
  let instance = $state.raw<GraphInstance | null>(null);

  /**
   * The selection callback is read through a holder.
   *
   * The parent passes a new closure on every render; reading the prop inside
   * the effect that creates the instance would re-create the canvas on every
   * render of the parent. The holder breaks that dependency.
   */
  let selectHandler: ((nodeId: string | null) => void) | undefined;
  let navigateHandler: ((nodeId: string) => void) | undefined;
  let zoomHandler: ((zoom: number, source: ZoomSource) => void) | undefined;

  $effect(() => {
    selectHandler = onselect;
    navigateHandler = onnavigate;
    zoomHandler = onzoomchange;
  });


  /**
   * Creates the instance **once** and destroys it on unmount.
   *
   * The effect reads the container and nothing else: a new subgraph patches
   * the elements (see below), it never re-creates the canvas.
   */
  $effect(() => {
    const element = container;
    if (element === undefined) {
      return;
    }

    let created: GraphInstance | null = null;
    let cancelled = false;

    // Cytoscape draws to a `<canvas>`: it needs a DOM. The module is
    // imported here so the server pass never evaluates it.
    //
    // The face of the title is awaited first: the card is measured with the
    // face that is **loaded**, and a card measured with the fallback of the
    // system would be sized for a font that is not the one that is drawn.
    void (async () => {
      await ensureTitleFont();

      const { createGraphInstance } = await import('$lib/graph/cytoscape');

      if (cancelled) {
        return;
      }

      created = createGraphInstance({
        container: element,
        // The zoom of the reader is read **once**: it belongs to the
        // reader, and the picture must not impose it again.
        zoom: untrack(() => zoom),
        onselect: (nodeId) => selectHandler?.(nodeId),
        onnavigate: (nodeId) => navigateHandler?.(nodeId),
        onzoom: (next, source) => {
          currentZoom = next;

          zoomHandler?.(next, source);
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
    const currentRoot = rootNodeId;
    const currentLocale = locale.locale;

    if (graph === null) {
      return;
    }

    graph.setElements(currentNodes, currentEdges, {
      focusNodeId: currentRoot,
      locale: currentLocale
    });
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
   * The zoom the picture is at.
   *
   * It is the zoom of the picture, whatever its origin: the fit of the
   * view or the choice of the reader.
   */
  let currentZoom = $state<number | null>(null);

  /**
   * The commands of the zoom of the reader.
   *
   * The toolbar asks and the canvas answers: the command carries the
   * **number** that tells it from the one before it, and the canvas that is
   * created later does not answer a command that was asked before it
   * existed.
   */
  let lastZoomRequest = untrack(() => zoomrequest);

  $effect(() => {
    const graph = instance;
    const request = zoomrequest;
    const action = zoomaction;

    if (graph === null || request === 0 || request === lastZoomRequest) {
      return;
    }

    lastZoomRequest = request;

    if (action === 'in') {
      graph.zoomIn();

      return;
    }

    if (action === 'out') {
      graph.zoomOut();

      return;
    }

    graph.fitView();
  });

  /**
   * Centres the picture on the node the user walked to.
   *
   * The effect is declared **after** the one that draws the elements: the
   * centre happens on the picture that has just been drawn, never on the
   * one that was there before it.
   */
  $effect(() => {
    const graph = instance;
    const request = centerRequest;
    const id = centerNodeId;

    if (graph === null || request === 0 || id === null) {
      return;
    }

    graph.centerOn(id);
  });
</script>

<!--
  The canvas is a picture: a screen reader cannot see it. The container
  therefore carries an accessible name and points at a short description,
  and the list view is the real alternative — one click away.

  The canvas is the **whole workspace**: it takes the space its container
  gives it, and it is painted with the ground of the design system. There
  is no edge, no radius and no texture around it: the picture is the
  background of the screen, exactly as it is in a drawing application.
-->
<div
  bind:this={container}
  role="img"
  aria-label={t('graph.canvasLabel')}
  aria-describedby={descriptionId}
  data-zoom={currentZoom ?? undefined}
  class="h-full w-full overflow-hidden bg-ground"
></div>

<!--
  The description of the picture. It is read by the screen reader through
  `aria-describedby`, and it is not painted under the canvas: the canvas
  is the workspace.
-->
<p id={descriptionId} class="sr-only">
  {description ?? t('graph.canvasDefaultDescription')}
</p>
