<script lang="ts">
  /**
   * The harness of the canvas and of the list view.
   *
   * The two views are siblings in the page and share one selection: the
   * harness reproduces that wiring so the test can check that a selection
   * made in one view reaches the other.
   */
  import GraphCanvas from '$lib/components/GraphCanvas.svelte';
  import GraphListView from '$lib/components/GraphListView.svelte';
  import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';

  interface Props {
    nodes: NodeDto[];
    edges: SubgraphEdgeDto[];
  }

  let { nodes, edges }: Props = $props();

  let selectedNodeId = $state<string | null>(null);
</script>

<GraphCanvas
  {nodes}
  {edges}
  {selectedNodeId}
  onselect={(nodeId) => {
    selectedNodeId = nodeId;
  }}
/>

<GraphListView
  {nodes}
  {edges}
  {selectedNodeId}
  onselect={(nodeId) => {
    selectedNodeId = nodeId;
  }}
/>
