<script lang="ts">
  import { untrack } from 'svelte';
  import type { ApiFailure } from '$lib/api/failure';
  import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
  import ExplorationCanvas from '$lib/components/ExplorationCanvas.svelte';
  import RichText from '$lib/components/RichText.svelte';
  import { EDGE_STYLES, type EdgeStyle } from '$lib/graph/explore/edge-style';
  import { FOCUS_CRITERIA, presentedNodeId, type FocusCriterion } from '$lib/graph/explore/focus';
  import type { TranslationKey } from '$lib/i18n';
  import { formatNumber } from '$lib/i18n';
  import { getLocaleState } from '$lib/state/context';

  interface Props {
    /** The nodes of the exploration window. */
    nodes?: NodeDto[];
    /** The relations of the exploration window. */
    edges?: SubgraphEdgeDto[];
    /** The id of the selected node, or `null` when nothing is selected. */
    selectedNodeId?: string | null;
    /** Called when the user selects a node in the view. */
    onselect?: (nodeId: string | null) => void;
    /** Whether the window is being read. */
    loading?: boolean;
    /** The failure of the last read, if it failed. */
    error?: ApiFailure | null;
  }

  let {
    nodes = [],
    edges = [],
    selectedNodeId = null,
    onselect,
    loading = false,
    error = null
  }: Props = $props();

  const locale = getLocaleState();
  const t = locale.t;

  /** The label of every criterion of the focus. */
  const FOCUS_LABELS: Record<FocusCriterion, TranslationKey> = {
    recent: 'explore.focusRecent',
    related: 'explore.focusRelated',
    manual: 'explore.focusManual'
  };

  /** The label of every shape of the relations. */
  const EDGE_STYLE_LABELS: Record<EdgeStyle, TranslationKey> = {
    straight: 'explore.edgeStraight',
    orthogonal: 'explore.edgeOrthogonal',
    bezier: 'explore.edgeBezier',
    unbundled: 'explore.edgeUnbundled',
    arc: 'explore.edgeArc',
    haystack: 'explore.edgeHaystack'
  };

  /** The criterion that decides which node the view presents. */
  let criterion = $state<FocusCriterion>('recent');

  /** The shape the relations are drawn with. */
  let edgeStyle = $state<EdgeStyle>('bezier');

  /** The node the user last clicked — the `manual` criterion. */
  let manualNodeId = $state<string | null>(null);

  /** The nodes that are drawn as a card. */
  let expandedIds = $state.raw<Set<string>>(new Set<string>());

  /** The node the view presents. */
  const presented = $derived(presentedNodeId(nodes, edges, criterion, manualNodeId));

  /** The node the view presents, as a node. */
  const presentedNode = $derived(
    presented === null ? null : (nodes.find((node) => node.id === presented) ?? null)
  );

  /** The last node the view presented. */
  let lastPresented: string | null = null;

  /**
   * The presented node is **expanded**.
   *
   * The view presents a node and shows it: a card the reader can read from
   * the picture itself. The user can still collapse it — an explicit choice
   * of the user beats the default.
   */
  $effect(() => {
    const current = presented;

    if (current === null || current === lastPresented) {
      return;
    }

    lastPresented = current;

    untrack(() => {
      expandedIds = new Set([...expandedIds, current]);
    });
  });

  /**
   * The node the user selected is the one the `manual` criterion presents.
   *
   * The selection is shared with the list view, so a click on the list is
   * a click on the picture too.
   */
  $effect(() => {
    const selected = selectedNodeId;

    if (selected !== null && selected !== manualNodeId) {
      manualNodeId = selected;
    }
  });

  /** The user selected a node: the selection is shared with the list. */
  function selectNode(nodeId: string | null): void {
    if (nodeId !== null) {
      manualNodeId = nodeId;
    }

    onselect?.(nodeId);
  }

  /** The user expanded or collapsed a node. */
  function toggleNode(nodeId: string): void {
    const next = new Set(expandedIds);

    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }

    expandedIds = next;
  }

  const nodeCount = $derived(formatNumber(locale.locale, nodes.length));
  const edgeCount = $derived(formatNumber(locale.locale, edges.length));
</script>

<div class="space-y-4">
  <div>
    <h3 class="text-base font-semibold tracking-tight">{t('explore.heading')}</h3>
    <p class="mt-1 max-w-prose text-sm text-ink-muted">{t('explore.intro')}</p>
  </div>

  <!--
    The nature of the window. A canvas that truncates in silence is a canvas
    that lies: the reader has to know what the window is and what it is not.
  -->
  <ul class="max-w-prose list-disc space-y-1 pl-5 text-xs text-ink-muted">
    <li><RichText text={t('explore.windowClosed')} /></li>
    <li><RichText text={t('explore.windowOrder')} /></li>
    <li>
      <RichText
        text={t('explore.windowBounds', {
          nodes: nodeCount,
          edges: edgeCount,
          max: formatNumber(locale.locale, 200)
        })}
      />
    </li>
  </ul>

  {#if error !== null}
    <p role="alert" class="rounded-md border border-negative/30 bg-negative/5 p-3 text-sm">
      <span class="font-mono">{error.code}</span> — {error.message}
    </p>
  {/if}

  <!-- The controls of the view. -->
  <div class="flex flex-wrap items-end gap-6">
    <fieldset class="min-w-0">
      <legend class="text-xs text-ink-muted">{t('explore.focusLabel')}</legend>
      <div class="mt-1 flex flex-wrap gap-1">
        {#each FOCUS_CRITERIA as option (option)}
          <input
            type="radio"
            id="explore-focus-{option}"
            name="explore-focus"
            value={option}
            class="peer sr-only"
            bind:group={criterion}
          />
          <label
            for="explore-focus-{option}"
            class="pointer-coarse:min-h-11 cursor-pointer rounded-md border border-line-strong px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-muted peer-checked:border-brand-900 peer-checked:bg-brand-50 peer-checked:text-brand-950 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600"
          >
            {t(FOCUS_LABELS[option])}
          </label>
        {/each}
      </div>
    </fieldset>

    <div>
      <label for="explore-edge-style" class="block text-xs text-ink-muted">
        {t('explore.edgeStyleLabel')}
      </label>
      <select
        id="explore-edge-style"
        class="mt-0.5 rounded-md border border-line-strong bg-surface px-2 py-1 text-sm text-ink"
        bind:value={edgeStyle}
      >
        {#each EDGE_STYLES as option (option)}
          <option value={option}>{t(EDGE_STYLE_LABELS[option])}</option>
        {/each}
      </select>
    </div>
  </div>

  <p class="max-w-prose text-xs text-ink-muted">
    {t('explore.focusHint')}
    {#if presentedNode !== null}
      <span class="font-medium text-ink">
        {t('explore.presented', { title: presentedNode.title })}
      </span>
    {/if}
  </p>

  {#if loading && nodes.length === 0}
    <p role="status" class="rounded-card border border-dashed border-line p-6 text-center text-sm text-ink-muted">
      {t('explore.loading')}
    </p>
  {:else if nodes.length === 0 && error === null}
    <p class="rounded-card border border-dashed border-line p-6 text-center text-sm text-ink-muted">
      {t('explore.empty')}
    </p>
  {:else}
    <ExplorationCanvas
      {nodes}
      {edges}
      {expandedIds}
      {edgeStyle}
      {selectedNodeId}
      presentedNodeId={presented}
      onselect={selectNode}
      ontoggle={toggleNode}
    />

    <ul class="max-w-prose list-disc space-y-1 pl-5 text-xs text-ink-muted">
      <li>{t('explore.hintHover')}</li>
      <li>{t('explore.hintPan')}</li>
      <li>{t('explore.hintDrag')}</li>
    </ul>
  {/if}
</div>
