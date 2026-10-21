<script lang="ts">
  import VoteButtons from '$lib/components/VoteButtons.svelte';
  import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
  import type { VoteLedger } from '$lib/governance/vote.svelte';
  import type { TranslationKey } from '$lib/i18n';
  import { displayName } from '$lib/i18n/display-name';
  import { formatNumber } from '$lib/i18n';
  import { edgeSelection, nodeSelection, type InspectorSelection } from '$lib/inspector/selection';
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
    /**
     * The selected thing — a node or a relation.
     *
     * The list shares the selection with the canvas and with the
     * inspector: a relation row is selectable too, not only a node row.
     */
    selection?: InspectorSelection | null;
    /** Called when the user selects a node or a relation in the list. */
    onselect?: (selection: InspectorSelection | null) => void;
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
    selection = null,
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

  /** `true` when the selection is the given node. */
  function isSelectedNode(nodeId: string): boolean {
    return selection?.kind === 'node' && selection.id === nodeId;
  }

  /** `true` when the selection is the given relation. */
  function isSelectedEdge(edgeId: string): boolean {
    return selection?.kind === 'edge' && selection.id === edgeId;
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
  <summary class="cursor-pointer font-semibold">
    {t(summaryKey)}
  </summary>

  <div class="mt-4 space-y-6">
  <section aria-labelledby="subgraph-nodes-heading">
    <h3 id="subgraph-nodes-heading">
      {t('graph.listNodesHeading')}
      <span class="font-normal text-muted">({nodeCount})</span>
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
      class="mt-2 overflow-x-auto rounded-card bg-surface"
      role="region"
      aria-label={t('graph.listNodesRegion')}
      tabindex="0"
    >
      <table class="w-full min-w-[32rem] border-collapse text-left text-body [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:bg-surface">
        <caption class="sr-only">
          {t('graph.listNodesCaption')}
        </caption>
        <thead class="text-small text-muted">
          <tr>
            <th scope="col" class="px-3 py-2 font-normal">{t('graph.columnTitle')}</th>
            <th scope="col" class="px-3 py-2 font-normal">{t('graph.columnType')}</th>
            <th scope="col" class="px-3 py-2 font-normal">{t('graph.columnStatus')}</th>
          </tr>
        </thead>
        <tbody>
          {#each nodes as node (node.id)}
            <tr class="border-t border-rule">
              <th scope="row" class="px-3 py-2 font-normal">
                <button
                  type="button"
                  class="rounded-control text-left text-text hover:bg-raised hover:text-accent-ink hover:underline hover:underline-offset-2 aria-[current=true]:bg-accent-soft aria-[current=true]:text-accent-ink aria-[current=true]:font-semibold"
                  aria-current={isSelectedNode(node.id) ? 'true' : undefined}
                  onclick={() => onselect?.(nodeSelection(node.id))}
                >
                  {node.title}
                </button>
              </th>
              <td class="px-3 py-2 text-muted">
                {displayName(node.typeDisplayNames, locale.locale, node.typeKey)}
              </td>
              <td class="px-3 py-2 text-muted">{locale.status('node', node.status)}</td>
            </tr>
          {:else}
            <tr>
              <td colspan="3" class="px-3 py-2 text-muted">{t('graph.listNoNodes')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section aria-labelledby="subgraph-relations-heading">
    <h3 id="subgraph-relations-heading">
      {t('graph.listRelationsHeading')}
      <span class="font-normal text-muted">({edgeCount})</span>
    </h3>

    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="mt-2 overflow-x-auto rounded-card bg-surface"
      role="region"
      aria-label={t('graph.listRelationsRegion')}
      tabindex="0"
    >
      <table class="w-full min-w-[32rem] border-collapse text-left text-body [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:bg-surface">
        <caption class="sr-only">
          {t('graph.listRelationsCaption')}
        </caption>
        <thead class="text-small text-muted">
          <tr>
            <th scope="col" class="px-3 py-2 font-normal">{t('graph.columnRelation')}</th>
            <th scope="col" class="px-3 py-2 font-normal">{t('graph.columnFrom')}</th>
            <th scope="col" class="px-3 py-2 font-normal">{t('graph.columnTo')}</th>
            <th scope="col" class="px-3 py-2 font-normal">{t('graph.columnStatus')}</th>
            {#if ledger}
              <th scope="col" class="px-3 py-2 font-normal">{t('graph.columnScore')}</th>
            {/if}
            {#if onpropose}
              <th scope="col" class="px-3 py-2 font-normal">{t('graph.columnCorrection')}</th>
            {/if}
          </tr>
        </thead>
        <tbody>
          {#each edges as edge (edge.id)}
            <tr class="border-t border-rule">
              <th scope="row" class="px-3 py-2 font-normal">
                <!--
                  The relation is selectable too: the inspector shows the
                  content and the attributes of a relation, and the list is
                  the text alternative of the canvas.
                -->
                <button
                  type="button"
                  class="rounded-control text-left text-text hover:bg-raised hover:text-accent-ink hover:underline hover:underline-offset-2 aria-[current=true]:bg-accent-soft aria-[current=true]:text-accent-ink aria-[current=true]:font-semibold"
                  aria-current={isSelectedEdge(edge.id) ? 'true' : undefined}
                  onclick={() => onselect?.(edgeSelection(edge.id))}
                >
                  {displayName(edge.relationDisplayNames, locale.locale, edge.relationKey)}
                </button>
              </th>
              <td class="px-3 py-2">
                <button
                  type="button"
                  class="rounded-control text-left text-text hover:bg-raised hover:text-accent-ink hover:underline hover:underline-offset-2"
                  onclick={() => onselect?.(nodeSelection(edge.sourceNodeId))}
                >
                  {titleOf(edge.sourceNodeId)}
                </button>
              </td>
              <td class="px-3 py-2">
                <button
                  type="button"
                  class="rounded-control text-left text-text hover:bg-raised hover:text-accent-ink hover:underline hover:underline-offset-2"
                  onclick={() => onselect?.(nodeSelection(edge.targetNodeId))}
                >
                  {titleOf(edge.targetNodeId)}
                </button>
              </td>
              <td class="px-3 py-2 text-muted">{locale.status('edge', edge.status)}</td>
              {#if ledger}
                <td class="px-3 py-2">
                  <VoteButtons
                    {ledger}
                    targetId={edge.id}
                    targetType="EDGE"
                    score={edge.communityScore}
                    label={t('graph.voteRelationLabel', {
                      relationKey: displayName(edge.relationDisplayNames, locale.locale, edge.relationKey)
                    })}
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
                    class="btn btn-secondary"
                    aria-label={t('graph.suggestCorrectionOfRelation', {
                      relationKey: displayName(edge.relationDisplayNames, locale.locale, edge.relationKey)
                    })}
                    onclick={() => onpropose(edge)}
                  >
                    {t('graph.suggestCorrection')}
                  </button>
                </td>
              {/if}
            </tr>
          {:else}
            <tr>
              <td colspan={4 + (ledger ? 1 : 0) + (onpropose ? 1 : 0)} class="px-3 py-2 text-muted">
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
