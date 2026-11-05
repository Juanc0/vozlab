<script lang="ts">
  /**
   * The search of the graph.
   *
   * It replaces the floating picker: a reader who wants a node names it in the
   * toolbar — where the tools of the picture live — and the picture goes to it.
   * The list is a listbox over the field, so the keyboard alone is enough.
   */
  import type { NodeDto } from '$lib/api/types';
  import { filterNodesByTitle } from '$lib/graph/root-search';
  import { displayName } from '$lib/i18n/display-name';
  import { getLocaleState } from '$lib/state/context';

  interface Props {
    /** The nodes the search can find. */
    nodes?: NodeDto[];
    /** Called with the id of the node the reader picked. */
    onselect?: (nodeId: string) => void;
  }

  let { nodes = [], onselect }: Props = $props();

  const locale = getLocaleState();
  const t = locale.t;

  /** What the reader typed. */
  let query = $state('');

  /** Whether the list of matches is over the picture. */
  let open = $state(false);

  /**
   * What the search found.
   *
   * An empty field is not a search: nothing is listed until there is
   * something to look for.
   */
  const matching = $derived(
    query.trim() === '' ? [] : filterNodesByTitle(nodes, query, locale.locale)
  );

  /** Takes the picture to the node and closes the list. */
  function choose(nodeId: string): void {
    query = '';
    open = false;
    onselect?.(nodeId);
  }
</script>

<div class="relative min-w-0">
  <label class="block">
    <span class="sr-only">{t('graph.searchLabel')}</span>
    <input
      type="search"
      class="w-full rounded-control border border-rule bg-surface px-3 py-1.5 text-body text-text"
      placeholder={t('graph.searchLabel')}
      bind:value={query}
      onfocus={() => (open = true)}
      oninput={() => (open = true)}
      onkeydown={(event) => {
        if (event.key === 'Escape') {
          open = false;
        }
      }}
    />
  </label>

  <!--
    What the search left is said out loud: the count of matches, or the
    sentence that nothing matches. A list that shrinks in silence reads as a
    list that broke.
  -->
  <p id="vozlab-root-search-status" class="sr-only" aria-live="polite">
    {#if query.trim() !== ''}
      {matching.length === 0
        ? t('graph.searchEmpty')
        : t('graph.searchMatches', { count: matching.length })}
    {/if}
  </p>

  {#if open && query.trim() !== ''}
    <ul
      class="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-card border border-rule bg-surface shadow-float"
      role="listbox"
      aria-label={t('graph.searchResults')}
    >
      {#each matching as node (node.id)}
        <li role="option" aria-selected="false">
          <button
            type="button"
            aria-label={node.title}
            class="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-raised hover:text-accent-ink"
            onclick={() => choose(node.id)}
          >
            <span class="min-w-0 truncate text-body text-text">{node.title}</span>
            <span class="shrink-0 text-small text-muted">
              {displayName(node.typeDisplayNames, locale.locale, node.typeKey)} ·
              {locale.status('node', node.status)}
            </span>
          </button>
        </li>
      {:else}
        <li class="px-3 py-2 text-small text-muted">{t('graph.searchEmpty')}</li>
      {/each}
    </ul>
  {/if}
</div>
