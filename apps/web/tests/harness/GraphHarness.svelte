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
  import type { InspectorSelection } from '$lib/inspector/selection';

  interface Props {
    nodes: NodeDto[];
    edges: SubgraphEdgeDto[];
  }

  let { nodes, edges }: Props = $props();

  let selection = $state<InspectorSelection | null>(null);
</script>

<GraphCanvas
  {nodes}
  {edges}
  selectedNodeId={selection?.kind === 'node' ? selection.id : null}
  onselect={(nodeId) => {
    selection = nodeId === null ? null : { kind: 'node', id: nodeId };
  }}
/>

<GraphListView
  {nodes}
  {edges}
  {selection}
  onselect={(chosen) => {
    selection = chosen;
  }}
/>
