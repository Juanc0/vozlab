<script lang="ts">
  import { untrack } from 'svelte';
  import { clampDepth } from '$lib/api/graph';
  import type { ApiFailure } from '$lib/api/failure';
  import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
  import ExplorationCanvas from '$lib/components/ExplorationCanvas.svelte';
  import RichText from '$lib/components/RichText.svelte';
  import { EDGE_STYLES, type EdgeStyle } from '$lib/graph/explore/edge-style';
  import { FOCUS_CRITERIA, presentedNodeId, type FocusCriterion } from '$lib/graph/explore/focus';
  import { filterNeighbourhood, type Neighbourhood } from '$lib/graph/explore/neighbourhood';
  import type { TranslationKey } from '$lib/i18n';
  import { formatNumber } from '$lib/i18n';
  import { getLocaleState } from '$lib/state/context';

  interface Props {
    /**
     * The **working set** of the view: the window and every subgraph the
     * user has walked to.
     *
     * The nodes accumulate as the user walks: what has been seen is never
     * lost.
     */
    nodes?: NodeDto[];
    /** The relations of the working set. */
    edges?: SubgraphEdgeDto[];
    /**
     * The depth of a walk.
     *
     * It is the depth that is already selected in the whole app: the same
     * number bounds the subgraph of the other view and the neighbourhood a
     * click asks for.
     */
    depth?: number;
    /** Called when the user changes the depth. */
    ondepthchange?: (depth: number) => void;
    /**
     * Called when the user **walks** to a node of the canvas.
     *
     * The app asks the API for the subgraph rooted at that node, at the
     * selected depth, and merges the answer into the working set.
     */
    onwalk?: (nodeId: string) => void;
    /** Whether a walk is on its way. */
    walking?: boolean;
    /** The title of the node the walk is about. */
    walkTargetTitle?: string | null;
    /** The failure of the last walk, if it failed. */
    walkError?: ApiFailure | null;
    /**
     * The title of the node whose neighbourhood came back empty.
   *
   * An empty neighbourhood is not a failure: the node simply has no
   * relations, and the interface says so.
   */
    walkIsolatedTitle?: string | null;
    /**
     * Called with the picture the view draws.
     *
     * The list view is the text alternative of the canvas: it shows the
     * same picture, so the app has to know what the picture is.
     */
    onpicture?: (picture: Neighbourhood) => void;
    /** The id of the selected node, or `null` when nothing is selected. */
    selectedNodeId?: string | null;
    /** The id of the selected relation, or `null` when nothing is selected. */
    selectedEdgeId?: string | null;
    /** Called when the user selects a node in the view. */
    onselect?: (nodeId: string | null) => void;
    /** Called when the user selects a relation — by tapping its card. */
    onselectedge?: (edgeId: string) => void;
    /** Whether the window is being read. */
    loading?: boolean;
    /** The failure of the last read, if it failed. */
    error?: ApiFailure | null;
  }

  let {
    nodes = [],
    edges = [],
    depth = 1,
    ondepthchange,
    onwalk,
    walking = false,
    walkTargetTitle = null,
    walkError = null,
    walkIsolatedTitle = null,
    onpicture,
    selectedNodeId = null,
    selectedEdgeId = null,
    onselect,
    onselectedge,
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

  /** The depths the API accepts. */
  const depthOptions = Array.from({ length: 4 }, (_, index) => index);

  /** The criterion that decides which node the view presents. */
  let criterion = $state<FocusCriterion>('recent');

  /** The shape the relations are drawn with. */
  let edgeStyle = $state<EdgeStyle>('bezier');

  /** The node the user last clicked — the `manual` criterion. */
  let manualNodeId = $state<string | null>(null);

  /**
   * Whether the picture shows **only the neighbourhood** of the focus.
   *
   * The default is the whole working set: the exploration view is a
   * landscape, and hiding what is far is a decision the reader makes when
   * he wants to concentrate.
   */
  let onlyNeighbourhood = $state(false);

  /** The nodes that are drawn as a card. */
  let expandedIds = $state.raw<Set<string>>(new Set<string>());

  /**
   * The relations that are drawn as a card with their whole content.
   *
   * A relation of the window carries its attributes, its author and its
   * date: the reader can ask for the whole of it, exactly as he asks for
   * the whole of a node.
   */
  let expandedEdgeIds = $state.raw<Set<string>>(new Set<string>());

  /** The node the view presents. */
  const presented = $derived(presentedNodeId(nodes, edges, criterion, manualNodeId));

  /** The node the view presents, as a node. */
  const presentedNode = $derived(
    presented === null ? null : (nodes.find((node) => node.id === presented) ?? null)
  );

  /**
   * The **picture**: what the canvas draws.
   *
   * It is the whole working set, or the neighbourhood of the focus when
   * the reader asks for it. The nodes that are not in the picture are not
   * drawn: a node that is in the picture and a relation whose ends are not
   * in the picture would be a line that goes nowhere.
   */
  const picture = $derived.by<Neighbourhood>(() => {
    if (!onlyNeighbourhood) {
      return { nodes: [...nodes], edges: [...edges] };
    }

    return filterNeighbourhood(nodes, edges, presented, depth);
  });

  /**
   * The picture is told to the app.
   *
   * The list view is the text alternative of the canvas: it has to show
   * the same picture, and the app is the one that draws the list.
   */
  $effect(() => {
    const current = picture;

    onpicture?.(current);
  });

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
   * a click on the picture too. A click **is** the user choosing: the
   * criterion follows, or the view would present another node the moment
   * the criterion is evaluated again.
   */
  $effect(() => {
    const selected = selectedNodeId;

    if (selected !== null && selected !== manualNodeId) {
      manualNodeId = selected;
      criterion = 'manual';
    }
  });

  /** The user selected a node: the selection is shared with the list. */
  function selectNode(nodeId: string | null): void {
    if (nodeId !== null) {
      manualNodeId = nodeId;

      // A click **is** the user choosing: the criterion switches to the
      // one the user picked, or the view would present another node the
      // moment the criterion is evaluated again — and the choice of the
      // reader would be undone under his hand.
      criterion = 'manual';
    }

    onselect?.(nodeId);
  }

  /** The user changed the depth of a walk. */
  function handleDepthChange(event: Event): void {
    const select = event.currentTarget;

    if (!(select instanceof HTMLSelectElement)) {
      return;
    }

    ondepthchange?.(clampDepth(Number(select.value)));
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

  /** The user expanded or collapsed a relation. */
  function toggleEdge(edgeId: string): void {
    const next = new Set(expandedEdgeIds);

    if (next.has(edgeId)) {
      next.delete(edgeId);
    } else {
      next.add(edgeId);
    }

    expandedEdgeIds = next;
  }

  /** The user selected a relation: the inspector shows it. */
  function selectEdge(edgeId: string): void {
    onselectedge?.(edgeId);
  }

  const nodeCount = $derived(formatNumber(locale.locale, nodes.length));
  const edgeCount = $derived(formatNumber(locale.locale, edges.length));

  /** The number of the nodes that are drawn. */
  const shownCount = $derived(formatNumber(locale.locale, picture.nodes.length));

  /** The number of the nodes that are not drawn. */
  const hiddenCount = $derived(formatNumber(locale.locale, nodes.length - picture.nodes.length));

  /** The label of the criterion that is active. */
  const activeCriterionLabel = $derived(t(FOCUS_LABELS[criterion]));
</script>

<div class="space-y-4">
  <div>
    <h3>{t('explore.heading')}</h3>
    <p class="mt-1 max-w-measure text-body text-muted">{t('explore.intro')}</p>
  </div>

  <!--
    The nature of the window. A canvas that truncates in silence is a canvas
    that lies: the reader has to know what the window is and what it is not.
  -->
  <ul class="max-w-measure list-disc space-y-1 pl-5 text-small text-muted">
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
    <p role="alert" class="rounded-control bg-pill-negative-bg p-3 text-body text-pill-negative-ink">
      <span class="font-mono">{error.code}</span> — {error.message}
    </p>
  {/if}

  <!--
    The failure of a walk. The picture stays on screen: the error is shown
    next to it, never instead of it.
  -->
  {#if walkError !== null}
    <p role="alert" class="rounded-control bg-pill-negative-bg p-3 text-body text-pill-negative-ink">
      <span class="font-mono">{walkError.code}</span> — {walkError.message}
    </p>
  {/if}

  <!--
    A node without relations is not a failure: its neighbourhood came back
    empty, and the interface says so instead of showing an error.
  -->
  {#if walkIsolatedTitle !== null}
    <p class="rounded-control bg-raised p-3 text-body">
      {t('explore.isolated', { title: walkIsolatedTitle })}
    </p>
  {/if}

  <!-- The controls of the view. -->
  <div class="flex flex-wrap items-end gap-6">
    <fieldset class="min-w-0">
      <legend class="text-small text-muted">{t('explore.focusLabel')}</legend>
      <div class="mt-1 inline-flex gap-1 rounded-control bg-raised p-1">
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
            class="pointer-coarse:min-h-11 cursor-pointer rounded-control px-2.5 py-1 text-small font-medium text-muted hover:text-text peer-checked:bg-surface peer-checked:text-text peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
          >
            {t(FOCUS_LABELS[option])}
          </label>
        {/each}
      </div>
    </fieldset>

    <!--
      The depth of a walk. It is the depth that is already selected in the
      whole app: the same number bounds the neighbourhood a click asks for
      and the subgraph of the other view.
    -->
    <div>
      <label for="explore-depth" class="block text-small text-muted">
        {t('explore.depthLabel')}
      </label>
      <select
        id="explore-depth"
        class="field mt-0.5"
        value={depth}
        aria-busy={walking}
        aria-describedby="explore-depth-help"
        onchange={handleDepthChange}
      >
        {#each depthOptions as option (option)}
          <option value={option}>{option}</option>
        {/each}
      </select>
      <p id="explore-depth-help" class="mt-1 max-w-60 text-small text-muted">
        {t('explore.depthHelp')}
      </p>
    </div>

    <div>
      <label for="explore-edge-style" class="block text-small text-muted">
        {t('explore.edgeStyleLabel')}
      </label>
      <select
        id="explore-edge-style"
        class="field mt-0.5"
        bind:value={edgeStyle}
      >
        {#each EDGE_STYLES as option (option)}
          <option value={option}>{t(EDGE_STYLE_LABELS[option])}</option>
        {/each}
      </select>
    </div>

    <!--
      The far nodes: the reader's choice.

      The switch says what it does and the numbers say the truth: how many
      nodes are in the picture and how many are hidden.
    -->
    <div class="min-w-0">
      <label for="explore-only-neighbourhood" class="flex items-center gap-2 text-small text-muted">
        <input
          id="explore-only-neighbourhood"
          type="checkbox"
          class="size-[18px] accent-accent"
          bind:checked={onlyNeighbourhood}
          aria-describedby="explore-scope-count"
        />
        {t('explore.onlyNeighbourhoodLabel')}
      </label>
      <p id="explore-only-neighbourhood-help" class="mt-1 max-w-60 text-small text-muted">
        {t('explore.onlyNeighbourhoodHelp')}
      </p>
    </div>
  </div>

  <p class="max-w-measure text-small text-muted">
    {t('explore.focusHint')}
    {#if presentedNode !== null}
      <span class="font-medium text-text">
        {t('explore.presented', { title: presentedNode.title })}
      </span>
    {/if}
  </p>

  <!--
    The criterion that is active is said out loud: the control shows it, and
    so does the text — the reader does not have to guess which of the three
    is in force.
  -->
  <p class="text-small text-muted">{t('explore.focusActive', { label: activeCriterionLabel })}</p>

  <!--
    The numbers of the picture. They come from the working set: the count is
    the truth, never an estimate.
  -->
  <p id="explore-scope-count" class="text-small text-muted">
    {#if onlyNeighbourhood}
      {t('explore.scopeFocused', { shown: shownCount, hidden: hiddenCount })}
    {:else}
      {t('explore.scopeAll', { shown: shownCount })}
    {/if}
  </p>

  <!--
    The state of the walk. The picture stays on screen while the answer is
    on its way — a canvas that empties and refills on every click feels
    broken — and the reader is told what is happening.

    The region is always in the document: a live region that appears with
    its text is not announced by every reader, and the state of a walk is
    something the reader has to hear.
  -->
  <p aria-live="polite" class="text-small text-muted">
    {#if walking}
      {t('explore.walking', { title: walkTargetTitle ?? '' })}
    {/if}
  </p>

  <div aria-busy={walking}>
    {#if loading && nodes.length === 0}
      <p role="status" class="rounded-card border border-dashed border-border p-4 text-center text-body text-muted">
        {t('explore.loading')}
      </p>
    {:else if nodes.length === 0 && error === null}
      <p class="rounded-card border border-dashed border-border p-4 text-center text-body text-muted">
        {t('explore.empty')}
      </p>
    {:else}
      <ExplorationCanvas
        nodes={picture.nodes}
        edges={picture.edges}
        {expandedIds}
        {expandedEdgeIds}
        {edgeStyle}
        {selectedNodeId}
        {selectedEdgeId}
        presentedNodeId={presented}
        onselect={selectNode}
        onnavigate={(nodeId) => onwalk?.(nodeId)}
        ontoggle={toggleNode}
        onselectedge={selectEdge}
        ontoggleedge={toggleEdge}
      />

      <ul class="max-w-measure list-disc space-y-1 pl-5 text-small text-muted">
        <li>{t('explore.hintHover')}</li>
        <li>{t('explore.hintPan')}</li>
        <li>{t('explore.hintDrag')}</li>
        <li><RichText text={t('explore.hintWalk')} /></li>
      </ul>
    {/if}
  </div>
</div>
