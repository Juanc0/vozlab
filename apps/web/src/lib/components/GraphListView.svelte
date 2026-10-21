<script lang="ts">
  import VoteButtons from '$lib/components/VoteButtons.svelte';
  import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
  import type { VoteLedger } from '$lib/governance/vote.svelte';
  import type { TranslationKey } from '$lib/i18n';
  import { formatNumber } from '$lib/i18n';
  import { getLocaleState } from '$lib/state/context';

  interface Props {
    /**
     * The key of the summary of the disclosure.
     *
     * The list is the text alternative of **both** views, so its summary
     * follows the mode: "the subgraph as a list" or "the exploration
     * window as a list".
     */
    summaryKey?: TranslationKey;
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
     * move the counter again. The owner of the relation reads its score
     * back and the ledger adopts it: the server stays the authority.
     */
    reconcileEdge?: (edgeId: string) => Promise<number | null>;
    /**
     * Called when the user wants to propose a correction of a relation.
     *
     * Any member of the workspace may propose one (FR-10).
     */
    onpropose?: (edge: SubgraphEdgeDto) => void;
  }

  let {
    summaryKey = 'graph.listSummary',
    nodes = [],
    edges = [],
    selectedNodeId = null,
    onselect,
    ledger,
    reconcileEdge,
    onpropose
  }: Props = $props();

  const locale = getLocaleState();
  const t = locale.t;

  /** The title of a node of the subgraph; the endpoints of a relation are always in it. */
  function titleOf(nodeId: string): string {
    return nodes.find((node) => node.id === nodeId)?.title ?? t('graph.unknownNode');
  }

  /** The number of the nodes, written with the conventions of the locale. */
  const nodeCount = $derived(formatNumber(locale.locale, nodes.length));

  /** The number of the relations, written with the conventions of the locale. */
  const edgeCount = $derived(formatNumber(locale.locale, edges.length));
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
    {t(summaryKey)}
  </summary>

  <div class="mt-4 space-y-6">
  <section aria-labelledby="subgraph-nodes-heading">
    <h3 id="subgraph-nodes-heading" class="text-sm font-semibold tracking-tight">
      {t('graph.listNodesHeading')}
      <span class="font-normal text-ink-muted">({nodeCount})</span>
    </h3>

    <!--
      The table can be wider than the screen: the scroll container is a
      region with a name, and it is focusable so that a keyboard user can
      scroll it (WCAG 2.2 SC 2.1.1).

      The `tabindex` on a non-interactive element is exactly the pattern of
      the accessible scrollable region: the container must be reachable with
      the keyboard, otherwise the columns that do not fit are out of reach.
    -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="mt-2 overflow-x-auto rounded-card border border-line"
      role="region"
      aria-label={t('graph.listNodesRegion')}
      tabindex="0"
    >
      <table class="w-full border-collapse text-left text-sm">
        <caption class="sr-only">
          {t('graph.listNodesCaption')}
        </caption>
        <thead class="bg-surface-muted text-xs tracking-wide text-ink-muted uppercase">
          <tr>
            <th scope="col" class="px-3 py-2 font-semibold">{t('graph.columnTitle')}</th>
            <th scope="col" class="px-3 py-2 font-semibold">{t('graph.columnType')}</th>
            <th scope="col" class="px-3 py-2 font-semibold">{t('graph.columnStatus')}</th>
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
              <td colspan="3" class="px-3 py-2 text-ink-muted">{t('graph.listNoNodes')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section aria-labelledby="subgraph-relations-heading">
    <h3 id="subgraph-relations-heading" class="text-sm font-semibold tracking-tight">
      {t('graph.listRelationsHeading')}
      <span class="font-normal text-ink-muted">({edgeCount})</span>
    </h3>

    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="mt-2 overflow-x-auto rounded-card border border-line"
      role="region"
      aria-label={t('graph.listRelationsRegion')}
      tabindex="0"
    >
      <table class="w-full border-collapse text-left text-sm">
        <caption class="sr-only">
          {t('graph.listRelationsCaption')}
        </caption>
        <thead class="bg-surface-muted text-xs tracking-wide text-ink-muted uppercase">
          <tr>
            <th scope="col" class="px-3 py-2 font-semibold">{t('graph.columnRelation')}</th>
            <th scope="col" class="px-3 py-2 font-semibold">{t('graph.columnFrom')}</th>
            <th scope="col" class="px-3 py-2 font-semibold">{t('graph.columnTo')}</th>
            <th scope="col" class="px-3 py-2 font-semibold">{t('graph.columnStatus')}</th>
            {#if ledger}
              <th scope="col" class="px-3 py-2 font-semibold">{t('graph.columnScore')}</th>
            {/if}
            {#if onpropose}
              <th scope="col" class="px-3 py-2 font-semibold">{t('graph.columnCorrection')}</th>
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
                    label={t('graph.voteRelationLabel', { relationKey: edge.relationKey })}
                    reconcile={
                      reconcileEdge
                        ? () => reconcileEdge(edge.id)
                        : undefined
                    }
                  />
                </td>
              {/if}
              {#if onpropose}
                <td class="px-3 py-2">
                  <button
                    type="button"
                    class="rounded-md border border-line-strong bg-surface px-2 py-1 text-xs font-medium text-ink hover:bg-surface-muted"
                    aria-label={t('graph.suggestCorrectionOfRelation', { relationKey: edge.relationKey })}
                    onclick={() => onpropose(edge)}
                  >
                    {t('graph.suggestCorrection')}
                  </button>
                </td>
              {/if}
            </tr>
          {:else}
            <tr>
              <td colspan={4 + (ledger ? 1 : 0) + (onpropose ? 1 : 0)} class="px-3 py-2 text-ink-muted">
                {t('graph.listNoRelations')}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
  </div>
</details>
