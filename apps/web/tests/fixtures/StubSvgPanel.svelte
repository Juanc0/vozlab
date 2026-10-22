<script lang="ts">
  /**
   * The **stub** of the SVG painter.
   *
   * The tests of the comparison assert the frame, the tabs and the
   * attribution of the measurements — not the drawing. The stub reports a
   * number of its own, with the two fields only the painter measures, so
   * the readout says which engine produced them.
   */
  import { untrack } from 'svelte';

  interface Props {
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
      buildMs: number;
      domElements: number;
    }) => void;
  }

  let {
    label = 'La imagen',
    nodes = [],
    edges = [],
    edgeStyle = 'bezier',
    onlayout
  }: Props = $props();

  // The window arrives after the first paint: the report follows the data,
  // as it does in the real painter. The callback is read untracked so a
  // report does not re-run the effect that produced it.
  $effect(() => {
    void nodes;
    void edges;

    untrack(() => {
      onlayout?.({
        ms: 55,
        settled: false,
        overlaps: 0,
        ticks: 7,
        frameMs: 0.5,
        alive: true,
        awake: false,
        shapeReached: true,
        threshold: 1.5,
        buildMs: 44,
        domElements: 444
      });
    });
  });
</script>

<div
  data-testid="svg-canvas"
  data-edge-style={edgeStyle}
  role="group"
  aria-label={label}
></div>
