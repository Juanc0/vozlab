<script lang="ts">
  /**
   * The **root picker** of the subgraph view.
   *
   * The subgraph is rooted at a node the user picks, and the list of the
   * newest nodes is a **list**: it does not fit in a row of controls, and
   * a list inside the toolbar is what made the toolbar ragged. It is a
   * panel of its own, floating over the canvas, at the other end of the
   * picture from the inspector.
   */
  import type { ApiFailure } from '$lib/api/failure';
  import type { NodeDto } from '$lib/api/types';
  import { displayName } from '$lib/i18n/display-name';
  import { getLocaleState } from '$lib/state/context';

  interface Props {
    /** The newest nodes of the workspace. */
    nodes?: NodeDto[];
    /** The id of the root of the subgraph, or `null` when there is none. */
    rootId?: string | null;
    /** Whether the list is being read. */
    loading?: boolean;
    /** The failure of the last read, if it failed. */
    error?: ApiFailure | null;
    /** Whether there are older nodes to read. */
    hasMore?: boolean;
    /** Called when the user picks a root. */
    onselect?: (nodeId: string) => void;
    /** Called when the user asks for the older nodes. */
    onmore?: () => void;
  }

  let {
    nodes = [],
    rootId = null,
    loading = false,
    error = null,
    hasMore = false,
    onselect,
    onmore
  }: Props = $props();

  const locale = getLocaleState();
  const t = locale.t;
</script>

<div class="p-3">
  <h2 class="text-section">{t('graph.rootHeading')}</h2>
  <p class="mt-1 text-small text-muted">
    {t('graph.rootHelp')}
  </p>

  {#if error}
    <p
      role="alert"
      class="mt-3 rounded-control bg-pill-negative-bg p-3 text-small text-pill-negative-ink"
    >
      <span class="font-mono">{error.code}</span> — {error.message}
    </p>
  {:else if loading && nodes.length === 0}
    <!--
      The loading state keeps the shape of the list it replaces: flat grey
      bars at the real size of the rows, and no shift when the nodes land.
    -->
    <div class="mt-3 space-y-3" role="status" aria-live="polite">
      <span class="sr-only">{t('graph.loadingNodes')}</span>
      {#each [0, 1, 2, 3, 4] as row (row)}
        <div class="skeleton w-full"></div>
      {/each}
    </div>
  {:else if nodes.length === 0}
    <p class="mt-3 text-small text-muted">
      {t('graph.noNodes')}
    </p>
  {:else}
    <ul class="mt-3 divide-y divide-rule">
      {#each nodes as node (node.id)}
        <li class="flex flex-wrap items-baseline justify-between gap-2 py-2">
          <button
            type="button"
            class="rounded-control text-left text-body text-text hover:bg-raised hover:text-accent-ink hover:underline hover:underline-offset-2 aria-[current=true]:font-semibold"
            aria-current={rootId === node.id ? 'true' : undefined}
            onclick={() => onselect?.(node.id)}
          >
            {node.title}
          </button>
          <span class="text-small text-muted">
            {displayName(node.typeDisplayNames, locale.locale, node.typeKey)} ·
            {locale.status('node', node.status)}
          </span>
        </li>
      {/each}
    </ul>

    {#if hasMore}
      <button
        type="button"
        class="btn btn-secondary mt-3"
        disabled={loading}
        onclick={() => onmore?.()}
      >
        {loading ? t('common.loading') : t('graph.showOlderNodes')}
      </button>
    {/if}
  {/if}
</div>
