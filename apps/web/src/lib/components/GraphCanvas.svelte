<script lang="ts">
  import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
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
    /** The text alternative of the canvas. */
    description?: string;
  }

  let {
    nodes = [],
    edges = [],
    selectedNodeId = null,
    rootNodeId = null,
    onselect,
    description
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

  $effect(() => {
    selectHandler = onselect;
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
        onselect: (nodeId) => selectHandler?.(nodeId)
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
</script>

<!--
  The canvas is a picture: a screen reader cannot see it. The container
  therefore carries an accessible name and points at a short description, and
  the list view below is the real alternative.

  Its height is a fraction of the **visual** viewport (`svh`, not `vh`: the
  chrome of a mobile browser changes the height of `vh`, and a canvas that
  is taller than the screen is a canvas that cannot be seen).

  The canvas is the one surface of the app that is **not** white: it is the
  ground, and the cards of the graph are the surfaces that sit on it. The
  card is separated from its background by a tone step, exactly like the
  cards of the interface are.
-->
<div
  bind:this={container}
  role="img"
  aria-label={t('graph.canvasLabel')}
  aria-describedby={descriptionId}
  class="h-[60svh] min-h-72 w-full overflow-hidden rounded-card bg-ground"
></div>

<p id={descriptionId} class="mt-2 text-body text-muted">
  {description ?? t('graph.canvasDefaultDescription')}
</p>
