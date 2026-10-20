<script lang="ts">
  import VoteButtons from '$lib/components/VoteButtons.svelte';
  import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
  import type { VoteLedger } from '$lib/governance/vote.svelte';

  interface Props {
    /** The nodes of the bounded subgraph. */
    nodes?: NodeDto[];
    /** The relations of the bounded subgraph. */
    edges?: SubgraphEdgeDto[];
    /** The id of the selected node, or `null` when nothing is selected. */
    selectedNodeId?: string | null;
    /** Called when the user selects a node in the list. */
    onselect?: (nodeId: string | null) => void;
    /** The session-local state of the votes, for the relations. */
    ledger?: VoteLedger;
    /**
     * Re-reads the score of a relation after the API counted the vote.
     *
     * The API has no read for the interactions, so the client cannot know
     * whether a vote was counted — the same type is idempotent and does not
     * move the counter again. The owner of the relation reads its score back
     * and the ledger adopts it: the server stays the authority.
     */
    reconcileEdge?: (edgeId: string) => Promise<number | null>;
  }

  let {
    nodes = [],
    edges = [],
    selectedNodeId = null,
    onselect,
    ledger,
    reconcileEdge
  }: Props = $props();

  /** The title of a node of the subgraph; the endpoints of a relation are always in it. */
  function titleOf(nodeId: string): string {
    return nodes.find((node) => node.id === nodeId)?.title ?? 'Unknown node';
  }
</script>

<!--
  The text alternative of the canvas.

  Cytoscape draws to a `<canvas>`: a screen reader sees nothing there. This
  view is the real alternative — every node and every relation of the
  subgraph, in real tables, with the selection kept in sync with the canvas.

  It is a disclosure: a long list can be collapsed, and the canvas then
  carries the short description of what it shows.
-->
<details open class="space-y-6">
  <summary class="cursor-pointer text-sm font-semibold tracking-tight">
    The subgraph as a list
  </summary>

  <div class="mt-4 space-y-6">
  <section aria-labelledby="subgraph-nodes-heading">
    <h3 id="subgraph-nodes-heading" class="text-sm font-semibold tracking-tight">
      Nodes of the subgraph
      <span class="font-normal text-ink-muted">({nodes.length})</span>
    </h3>

    <div class="mt-2 overflow-x-auto rounded-card border border-line">
      <table class="w-full border-collapse text-left text-sm">
        <caption class="sr-only">
          The nodes of the subgraph: title, ontology class and status.
        </caption>
        <thead class="bg-surface-muted text-xs tracking-wide text-ink-muted uppercase">
          <tr>
            <th scope="col" class="px-3 py-2 font-semibold">Title</th>
            <th scope="col" class="px-3 py-2 font-semibold">Type</th>
            <th scope="col" class="px-3 py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {#each nodes as node (node.id)}
            <tr class="border-t border-line">
              <th scope="row" class="px-3 py-2 font-normal">
                <button
                  type="button"
                  class="rounded text-left text-brand-900 underline decoration-brand-300 underline-offset-2 hover:decoration-brand-700 aria-[current=true]:font-semibold aria-[current=true]:text-brand-950"
                  aria-current={selectedNodeId === node.id ? 'true' : undefined}
                  onclick={() => onselect?.(node.id)}
                >
                  {node.title}
                </button>
              </th>
              <td class="px-3 py-2 text-ink-muted">{node.typeKey}</td>
              <td class="px-3 py-2 text-ink-muted">{node.status}</td>
            </tr>
          {:else}
            <tr>
              <td colspan="3" class="px-3 py-2 text-ink-muted">The subgraph has no node.</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section aria-labelledby="subgraph-relations-heading">
    <h3 id="subgraph-relations-heading" class="text-sm font-semibold tracking-tight">
      Relations of the subgraph
      <span class="font-normal text-ink-muted">({edges.length})</span>
    </h3>

    <div class="mt-2 overflow-x-auto rounded-card border border-line">
      <table class="w-full border-collapse text-left text-sm">
        <caption class="sr-only">
          The relations of the subgraph: relation key, endpoints, status and score.
        </caption>
        <thead class="bg-surface-muted text-xs tracking-wide text-ink-muted uppercase">
          <tr>
            <th scope="col" class="px-3 py-2 font-semibold">Relation</th>
            <th scope="col" class="px-3 py-2 font-semibold">From</th>
            <th scope="col" class="px-3 py-2 font-semibold">To</th>
            <th scope="col" class="px-3 py-2 font-semibold">Status</th>
            {#if ledger}
              <th scope="col" class="px-3 py-2 font-semibold">Score</th>
            {/if}
          </tr>
        </thead>
        <tbody>
          {#each edges as edge (edge.id)}
            <tr class="border-t border-line">
              <th scope="row" class="px-3 py-2 font-normal text-ink-muted">{edge.relationKey}</th>
              <td class="px-3 py-2">
                <button
                  type="button"
                  class="rounded text-left text-brand-900 underline decoration-brand-300 underline-offset-2 hover:decoration-brand-700"
                  onclick={() => onselect?.(edge.sourceNodeId)}
                >
                  {titleOf(edge.sourceNodeId)}
                </button>
              </td>
              <td class="px-3 py-2">
                <button
                  type="button"
                  class="rounded text-left text-brand-900 underline decoration-brand-300 underline-offset-2 hover:decoration-brand-700"
                  onclick={() => onselect?.(edge.targetNodeId)}
                >
                  {titleOf(edge.targetNodeId)}
                </button>
              </td>
              <td class="px-3 py-2 text-ink-muted">{edge.status}</td>
              {#if ledger}
                <td class="px-3 py-2">
                  <VoteButtons
                    {ledger}
                    targetId={edge.id}
                    targetType="EDGE"
                    score={edge.communityScore}
                    label={`the relation ${edge.relationKey}`}
                    reconcile={
                      reconcileEdge
                        ? () => reconcileEdge(edge.id)
                        : undefined
                    }
                  />
                </td>
              {/if}
            </tr>
          {:else}
            <tr>
              <td colspan={ledger ? 5 : 4} class="px-3 py-2 text-ink-muted">
                The subgraph has no relation.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
  </div>
</details>
