<script lang="ts">
  /**
   * The **panel of the SVG painter**.
   *
   * It is the thin Svelte shell of {@link createSvgPainter}: the painter is
   * created once, the data is handed to it when it changes, the selection
   * and the presented node are reflected without rebuilding the picture,
   * and the painter is destroyed when the engine is unmounted.
   *
   * The shell has no drawing of its own: the picture is the painter's, so
   * the panel does not put anything between the container and the `<svg>`.
   */
  import { untrack } from 'svelte';
  import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
  import { getLocaleState } from '$lib/state/context';
  import type { EdgeStyle } from '$lib/graph/explore/edge-style';
  import {
    createSvgPainter,
    type SvgPainter,
    type SvgPainterReport
  } from './painter';

  interface Props {
    /** The nodes of the picture. */
    nodes: NodeDto[];
    /** The relations of the picture. */
    edges: SubgraphEdgeDto[];
    /** The nodes that are drawn with their whole content. */
    expandedIds: ReadonlySet<string>;
    /** The id of the selected node. */
    selectedNodeId: string | null;
    /** The id of the node the view presents. */
    presentedNodeId: string | null;
    /** The shape the relations are drawn with. */
    edgeStyle: EdgeStyle;
    /** The accessible name of the picture. */
    label: string;
    /** Called when the user selects a node. */
    onselect?: (nodeId: string | null) => void;
    /** Called when the user expands or collapses a node. */
    ontoggle?: (nodeId: string) => void;
    /** Called when the painter reports its arrangement. */
    onlayout?: (report: SvgPainterReport) => void;
    /** Called when the painter could not draw. */
    onerror?: (message: string) => void;
  }

  let {
    nodes,
    edges,
    expandedIds,
    selectedNodeId,
    presentedNodeId,
    edgeStyle,
    label,
    onselect,
    ontoggle,
    onlayout,
    onerror
  }: Props = $props();

  const locale = getLocaleState();
  const t = locale.t;

  let container: HTMLDivElement | undefined = $state();
  let painter = $state.raw<SvgPainter | null>(null);

  /**
   * The callbacks are read through holders.
   *
   * The parent passes a new closure on every render; the painter must not
   * be re-created —and the camera reset— because of it.
   */
  let selectHandler: ((nodeId: string | null) => void) | undefined;
  let toggleHandler: ((nodeId: string) => void) | undefined;
  let layoutHandler: ((report: SvgPainterReport) => void) | undefined;
  let errorHandler: ((message: string) => void) | undefined;

  $effect(() => {
    selectHandler = onselect;
    toggleHandler = ontoggle;
    layoutHandler = onlayout;
    errorHandler = onerror;
  });

  /** The message of a painter that could not draw. */
  function failureMessage(caught: unknown): string {
    const detail = caught instanceof Error ? caught.message : String(caught);

    return `${t('engines.svgPainterError')} ${detail}`;
  }

  /**
   * Creates the painter **once** and destroys it on unmount.
   *
   * The effect reads the container, the language and the name: a change of
   * either of the last two is a new label, and the picture is built again
   * with the label the reader can hear.
   */
  $effect(() => {
    const element = container;

    if (element === undefined) {
      return;
    }

    let created: SvgPainter;

    try {
      created = createSvgPainter({
        container: element,
        label,
        locale: locale.locale,
        onselect: (nodeId) => selectHandler?.(nodeId),
        ontoggle: (nodeId) => toggleHandler?.(nodeId),
        onlayout: (report) => layoutHandler?.(report),
        onerror: (message) => errorHandler?.(message)
      });
    } catch (caught) {
      errorHandler?.(failureMessage(caught));

      return;
    }

    painter = created;

    return () => {
      created.destroy();
      painter = null;
    };
  });

  /** Hands the data to the painter. The selection is a paint, not a rebuild. */
  $effect(() => {
    const instance = painter;
    const currentNodes = nodes;
    const currentEdges = edges;
    const currentExpanded = expandedIds;

    // The shape of the relations is a paint of its own: it does not change
    // the cards, and a new picture is not built for it.
    const currentStyle = untrack(() => edgeStyle);

    if (instance === null) {
      return;
    }

    try {
      instance.setElements({
        nodes: currentNodes,
        edges: currentEdges,
        expandedIds: currentExpanded,
        edgeStyle: currentStyle
      });
    } catch (caught) {
      errorHandler?.(failureMessage(caught));
    }
  });

  $effect(() => {
    painter?.setSelected(selectedNodeId);
  });

  $effect(() => {
    painter?.setPresented(presentedNodeId);
  });

  $effect(() => {
    painter?.setEdgeStyle(edgeStyle);
  });
</script>

<!-- The painter appends its `<svg>` here: the shell is the room alone. -->
<div bind:this={container} class="h-full w-full"></div>
