<script lang="ts">
  /**
   * The **stub** of the canvas of Cytoscape.
   *
   * The tests of the comparison do not draw: they assert that the engine
   * that is on screen is the one that is mounted, and that the
   * measurements belong to it. The stub reports an arrangement of its own,
   * and the time it reports says which engine produced it.
   */
  import { untrack } from 'svelte';

  interface Props {
    layout?: string;
    label?: string;
    nodes?: unknown[];
    edges?: unknown[];
    expandedIds?: ReadonlySet<string>;
    selectedNodeId?: string | null;
    presentedNodeId?: string | null;
    edgeStyle?: string;
    onselect?: (nodeId: string | null) => void;
    ontoggle?: (nodeId: string) => void;
    onlayout?: (report: {
      ms: number;
      settled: boolean;
      overlaps: number;
      ticks: number;
      frameMs: number;
      alive: boolean;
      awake: boolean;
      shapeReached: boolean;
      threshold: number;
    }) => void;
  }

  let {
    layout = 'd3',
    label = 'El lienzo',
    nodes = [],
    edges = [],
    onlayout
  }: Props = $props();

  /** The time the arrangement takes — the number says which engine it is. */
  const TIMES: Record<string, number> = {
    d3: 22
  };

  // The window arrives after the first paint: the report follows the data,
  // as it does in the real canvas. The callback is read untracked so a
  // report does not re-run the effect that produced it.
  $effect(() => {
    void nodes;
    void edges;

    untrack(() => {
      onlayout?.({
        ms: TIMES[layout] ?? 99,
        settled: false,
        overlaps: 1,
        ticks: 5,
        frameMs: 2,
        alive: true,
        awake: false,
        shapeReached: true,
        threshold: 1.5
      });
    });
  });
</script>

<div
  data-testid="cytoscape-canvas"
  data-layout={layout}
  role="img"
  aria-label={label}
></div>
