<script lang="ts">
  /**
   * The **stub** of the canvas of Cytoscape.
   *
   * The tests of the comparison do not draw: they assert that the engine
   * that is on screen is the one that is mounted, and that the
   * measurements belong to it. The stub reports an arrangement of its own,
   * and the time it reports says which engine produced it.
   */
  import { onMount } from 'svelte';

  interface Props {
    layout?: string;
    label?: string;
    nodes?: unknown[];
    edges?: unknown[];
    expandedIds?: ReadonlySet<string>;
    selectedNodeId?: string | null;
    presentedNodeId?: string | null;
    edgeStyle?: string;
    /**
     * The **clone** the comparison hands over.
     *
     * The stub says whether it got one: the clone is the dependency of the
     * development surface, and the picture of the app never has one.
     */
    dagLayout?: unknown;
    onselect?: (nodeId: string | null) => void;
    ontoggle?: (nodeId: string) => void;
    onlayout?: (report: {
      ms: number;
      settled: boolean;
      overlaps: number;
      ticks: number;
      frameMs: number;
      reversedRelations: string[];
    }) => void;
  }

  let { layout = 'dagre', label = 'El lienzo', dagLayout = undefined, onlayout }: Props = $props();

  /** The time each arrangement takes — the number says which engine it is. */
  const TIMES: Record<string, number> = {
    dagre: 11,
    d3: 22,
    dag: 33
  };

  onMount(() => {
    onlayout?.({
      ms: TIMES[layout] ?? 99,
      settled: true,
      overlaps: 1,
      ticks: 5,
      frameMs: 2,
      reversedRelations: []
    });
  });
</script>

<div
  data-testid="cytoscape-canvas"
  data-layout={layout}
  data-dag-layout={typeof dagLayout === 'function' ? 'clone' : 'none'}
  role="img"
  aria-label={label}
></div>
