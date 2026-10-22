<script lang="ts">
  /**
   * The **panel of an engine** — the implementation that is on screen.
   *
   * The comparison does **not** impose a shared layout on the engines: each
   * one brings its own arrangement (the layered one of `dagre`, the living
   * spring of `d3-force`, the clone of `d3-dag`) and the canvas of
   * Cytoscape paints all three.
   *
   * What the comparison gives it is the **room** and the **data**: the same
   * window, the same nodes and the same relations.
   *
   * Only **one** engine is mounted at a time: the block is keyed by the
   * engine, so choosing another one unmounts the previous one and releases
   * its canvas. Two engines never draw on the same space.
   */
  import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
  import ExplorationCanvas from '$lib/components/ExplorationCanvas.svelte';
  import type { EdgeStyle } from '$lib/graph/explore/edge-style';
  import { engineDescriptor, type EngineId, type EngineMeasurement } from './engines';
  import { createDagLayout } from './dag';

  interface Props {
    /** The engine that is on screen. */
    engine: EngineId;
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
    /**
     * Called when an engine reports its arrangement.
     *
     * The report carries the id of the engine that produced it: the
     * measurements belong to the engine that was measured, never to the one
     * that was on screen when the report arrived.
     */
    onlayout?: (engine: EngineId, measurement: EngineMeasurement) => void;
    /** Called when the engine could not be drawn. */
    onerror?: (message: string) => void;
    /** Called with the element the picture is drawn in, for the measurements. */
    oncontainer?: (element: HTMLElement | undefined) => void;
  }

  let {
    engine,
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
    onerror,
    oncontainer
  }: Props = $props();

  /** What the engine is. */
  const descriptor = $derived(engineDescriptor(engine));

  let container: HTMLDivElement | undefined = $state();

  /**
   * The callback is read through a holder: the parent passes a new closure
   * on every render, and the effect that publishes the element must not
   * run again for that.
   */
  let containerHandler: ((element: HTMLElement | undefined) => void) | undefined;

  $effect(() => {
    containerHandler = oncontainer;
  });

  $effect(() => {
    const element = container;

    if (element === undefined) {
      return;
    }

    containerHandler?.(element);

    return () => {
      containerHandler?.(undefined);
    };
  });
</script>

<!--
  The space of the picture. It does not change when the engine changes: the
  engines come and go **inside** it, and the space is the same space.
-->
<div bind:this={container} class="h-full w-full">
  <!--
    The key is the engine: choosing another one destroys the canvas of the
    previous one — the instance of Cytoscape, the context of WebGL — and
    mounts the new one in the same space.
  -->
  {#key engine}
    <ExplorationCanvas
      {nodes}
      {edges}
      {expandedIds}
      {selectedNodeId}
      {presentedNodeId}
      {edgeStyle}
      {label}
      layout={descriptor.layout}
      /**
       * The **clone** is handed over here: the library `d3-dag` is a
       * dependency of this development surface, and the picture of the
       * app never imports it.
       */
      dagLayout={createDagLayout}
      onerror={(message) => onerror?.(message)}
      onselect={(nodeId) => onselect?.(nodeId)}
      ontoggle={(nodeId) => ontoggle?.(nodeId)}
      onlayout={(report) => {
        onlayout?.(engine, {
          ms: report.ms,
          settled: report.settled,
          overlaps: report.overlaps,
          ticks: report.ticks,
          frameMs: report.frameMs,
          tickMs: report.tickMs,
          alive: report.alive,
          awake: report.awake,
          shapeReached: report.shapeReached,
          threshold: report.threshold,
          reversedRelations: report.reversedRelations
        });
      }}
    />
  {/key}
</div>
