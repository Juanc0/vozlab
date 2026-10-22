<script lang="ts">
  /**
   * The **stub** of the panel of Sigma.js.
   *
   * The WebGL renderer cannot be drawn in a test: the stub stands in for
   * it, and the time it reports says which engine produced it.
   */
  import { onMount } from 'svelte';

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
    onsettled?: (report: { ms: number; iterations: number; overlaps: number }) => void;
    onerror?: (message: string) => void;
  }

  let { label = 'El lienzo', onsettled }: Props = $props();

  onMount(() => {
    onsettled?.({ ms: 55, iterations: 7, overlaps: 2 });
  });
</script>

<div data-testid="sigma-canvas" role="img" aria-label={label}></div>
