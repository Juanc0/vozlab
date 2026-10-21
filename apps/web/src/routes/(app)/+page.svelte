<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { page } from '$app/state';
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import {
    NODE_LIST_DEFAULT_LIMIT,
    NODE_WINDOW_DEFAULT_LIMIT,
    SUBGRAPH_DEFAULT_DEPTH,
    SUBGRAPH_DEFAULT_NODES,
    SUBGRAPH_MAX_DEPTH,
    SUBGRAPH_MAX_NODES,
    clampDepth,
    clampSubgraphLimit,
    getNode,
    listWorkspaceNodes,
    loadNodeWindow,
    loadSubgraph,
    type CreatedNode
  } from '$lib/api/graph';
  import { loadOntology } from '$lib/api/ontology';
  import type { CreatedProposal } from '$lib/api/proposals';
  import type { NodeDto, OntologyResponseDto, SubgraphEdgeDto } from '$lib/api/types';
  import { redirectToLoginOnAuthFailure } from '$lib/auth/require-session';
  import CorrectionDialog from '$lib/components/CorrectionDialog.svelte';
  import EdgeCreateDialog from '$lib/components/EdgeCreateDialog.svelte';
  import ExplorationView from '$lib/components/ExplorationView.svelte';
  import GraphCanvas from '$lib/components/GraphCanvas.svelte';
  import GraphListView from '$lib/components/GraphListView.svelte';
  import Inspector from '$lib/components/Inspector.svelte';
  import NodeCreateDialog from '$lib/components/NodeCreateDialog.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import type { CorrectionTarget } from '$lib/governance/correction';
  import { VoteLedger } from '$lib/governance/vote.svelte';
  import { formatNumber } from '$lib/i18n';
  import { nodeSelection, type InspectorSelection } from '$lib/inspector/selection';
  import { MediaQuery } from '$lib/layout/media.svelte';
  import { getApiClient, getLocaleState, getWorkspaceState } from '$lib/state/context';
  import RichText from '$lib/components/RichText.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const api = getApiClient();
  const workspace = getWorkspaceState();
  const locale = getLocaleState();
  const t = locale.t;

  /** The depths the API accepts. */
  const depthOptions = Array.from({ length: SUBGRAPH_MAX_DEPTH + 1 }, (_, index) => index);

  /** The newest nodes of the workspace — the root picker. */
  let rootNodes = $state.raw<NodeDto[]>([]);
  let rootCursor = $state<string | null>(null);
  let rootsLoading = $state(false);
  let rootsError = $state<ApiFailure | null>(null);

  /** The bounded subgraph on the canvas. */
  let graphNodes = $state.raw<NodeDto[]>([]);
  let graphEdges = $state.raw<SubgraphEdgeDto[]>([]);

  /** The exploration window: the newest nodes of the workspace. */
  let windowNodes = $state.raw<NodeDto[]>([]);
  let windowEdges = $state.raw<SubgraphEdgeDto[]>([]);
  let windowLoading = $state(false);
  let windowError = $state<ApiFailure | null>(null);

  /**
   * The view the page shows.
   *
   * It is a piece of the state of the page, not a route: the URL stays
   * clean (FR-04) and both views stay reachable.
   */
  type ViewMode = 'subgraph' | 'explore';
  let viewMode = $state<ViewMode>('subgraph');

  /** The two views of the graph, in the order the switch shows them. */
  const VIEW_MODES: readonly ViewMode[] = ['subgraph', 'explore'];

  /** The session-local state of the votes on the relations. */
  const ledger = new VoteLedger();
  let graphLoaded = $state(false);
  let graphLoading = $state(false);
  let graphError = $state<ApiFailure | null>(null);

  /** The root of the subgraph and the bounds of the query. */
  let rootId = $state<string | null>(null);
  let depth = $state(SUBGRAPH_DEFAULT_DEPTH);
  let limit = $state(SUBGRAPH_DEFAULT_NODES);

  /**
   * The selected thing — a node or a relation.
   *
   * The selection is a **union**: the canvas selects nodes and the list
   * view selects nodes *and* relations, and the inspector shows whichever
   * is selected.
   */
  let selection = $state<InspectorSelection | null>(null);

  /**
   * `true` while the inspector is open.
   *
   * The canvas needs the room: the inspector is folded away when the user
   * wants to read the titles of the nodes.
   *
   * The state is **one** for the two shapes of the inspector: in a wide
   * screen it folds the column, in a narrow one it opens the sheet. The
   * width of the window decides which one it is.
   */
  let inspectorOpen = $state(true);

  /**
   * The width at which the inspector is a column of the page.
   *
   * Below it the inspector is a sheet that comes over the content: as a
   * column it would fall after the whole list of nodes, thousands of pixels
   * down, where nobody finds it.
   */
  const inspectorWide = new MediaQuery('(min-width: 1280px)');

  /** The id of the panel of the inspector — the toggle points at it. */
  const INSPECTOR_PANEL_ID = 'vozlab-inspector-panel';

  /** The id of the sheet of the inspector — the toggle points at it. */
  const INSPECTOR_SHEET_ID = 'vozlab-inspector-sheet';

  onMount(() => {
    inspectorWide.attach();

    return () => {
      inspectorWide.destroy();
    };
  });

  /**
   * The inspector follows the width of the window.
   *
   * A wide window shows the column and a narrow one shows the sheet, and
   * the sheet starts closed: a panel that covers the whole canvas of a
   * phone the moment it arrives is a panel nobody asked for.
   */
  $effect(() => {
    const wide = inspectorWide.matches;

    untrack(() => {
      inspectorOpen = wide;
    });
  });

  /** The active metamodel — it drives the creation forms. */
  let ontology = $state.raw<OntologyResponseDto | null>(null);
  let ontologyLoading = $state(false);
  let ontologyError = $state<ApiFailure | null>(null);

  /** The creation forms. */
  let nodeDialogOpen = $state(false);
  let edgeDialogOpen = $state(false);
  let edgeSource = $state<NodeDto | null>(null);

  /** The correction form and its target. */
  let correctionOpen = $state(false);
  let correctionTarget = $state<CorrectionTarget | null>(null);

  /**
   * A message for the user, with an optional link.
   *
   * The link of the correction notice points at the proposals screen with
   * the new proposal selected: the proposal exists, and the author of the
   * target has to act on it.
   */
  interface Notice {
    readonly text: string;
    readonly link?: { readonly href: string; readonly label: string };
  }

  /** The outcome of the last creation — announced to the user. */
  let notice = $state<Notice | null>(null);

  /** The counters that discard the answer of a superseded request. */
  let rootsRequest = 0;
  let graphRequest = 0;
  let ontologyRequest = 0;
  let windowRequest = 0;

  /** The selected node — it is the one the canvas and the list highlight. */
  const selectedNodeId = $derived(selection?.kind === 'node' ? selection.id : null);

  /** The nodes the list view shows: the ones of the view on screen. */
  const listNodes = $derived(viewMode === 'explore' ? windowNodes : graphNodes);

  /** The relations the list view shows: the ones of the view on screen. */
  const listEdges = $derived(viewMode === 'explore' ? windowEdges : graphEdges);

  /**
   * The workspace is the scope of every read.
   *
   * A root of another workspace does not exist in this one, so the selection
   * and the graph are dropped when the workspace changes. The effect reads
   * the workspace id and nothing else: it does not re-run when the data
   * changes.
   */
  $effect(() => {
    const workspaceId = workspace.currentWorkspaceId;

    if (workspaceId === '') {
      return;
    }

    // The answers of the requests of the previous workspace are discarded.
    rootsRequest += 1;
    graphRequest += 1;
    ontologyRequest += 1;
    windowRequest += 1;

    rootId = null;
    selection = null;
    graphNodes = [];
    graphEdges = [];
    graphLoaded = false;
    graphError = null;
    windowNodes = [];
    windowEdges = [];
    windowError = null;
    ontology = null;
    ontologyError = null;
    nodeDialogOpen = false;
    edgeDialogOpen = false;
    edgeSource = null;
    correctionOpen = false;
    correctionTarget = null;
  });

  /** Reads the newest nodes of the workspace (the root picker). */
  $effect(() => {
    const workspaceId = workspace.currentWorkspaceId;

    if (workspaceId === '') {
      return;
    }

    void loadRoots(null);
  });

  /** Reads the active metamodel — it drives the creation forms. */
  $effect(() => {
    const workspaceId = workspace.currentWorkspaceId;

    if (workspaceId === '') {
      return;
    }

    void loadOntologyOnce();
  });

  /** Reads the bounded subgraph of the root. */
  $effect(() => {
    const id = rootId;
    const currentDepth = depth;
    const currentLimit = limit;

    if (id === null) {
      return;
    }

    void loadGraph(id, currentDepth, currentLimit);
  });

  /**
   * Reads the exploration window — when the view asks for it.
   *
   * The window is only read when the exploration view is on screen: the
   * other view does not need it, and a read that nobody looks at is a read
   * the API does not have to answer.
   */
  $effect(() => {
    const workspaceId = workspace.currentWorkspaceId;
    const mode = viewMode;

    if (workspaceId === '' || mode !== 'explore') {
      return;
    }

    void loadWindow();
  });

  /**
   * Reads one page of the newest nodes.
   *
   * The list is read after the await, never before: the effect that calls
   * this function must not depend on the list it fills.
   */
  async function loadRoots(cursor: string | null): Promise<void> {
    const current = (rootsRequest += 1);
    rootsLoading = true;
    rootsError = null;

    try {
      const nodePage = await listWorkspaceNodes(api, { limit: NODE_LIST_DEFAULT_LIMIT, cursor });
      if (current !== rootsRequest) {
        return;
      }
      rootNodes = cursor === null ? nodePage.items : [...rootNodes, ...nodePage.items];
      rootCursor = nodePage.nextCursor;
    } catch (caught) {
      if (current !== rootsRequest) {
        return;
      }
      if (await redirectToLoginOnAuthFailure(caught, workspace, page.url.pathname)) {
        return;
      }
      rootsError = describeFailure(caught, t);
    } finally {
      if (current === rootsRequest) {
        rootsLoading = false;
      }
    }
  }

  /**
   * Reads the active metamodel of the workspace.
   *
   * The ontology drives the creation forms: the classes the user can pick
   * and the attributes each of them declares. It is read once per workspace.
   */
  async function loadOntologyOnce(): Promise<void> {
    const current = (ontologyRequest += 1);
    ontologyLoading = true;
    ontologyError = null;

    try {
      const active = await loadOntology(api);
      if (current !== ontologyRequest) {
        return;
      }
      ontology = active;
    } catch (caught) {
      if (current !== ontologyRequest) {
        return;
      }
      if (await redirectToLoginOnAuthFailure(caught, workspace, page.url.pathname)) {
        return;
      }
      ontologyError = describeFailure(caught, t);
    } finally {
      if (current === ontologyRequest) {
        ontologyLoading = false;
      }
    }
  }

  /**
   * Reads the bounded subgraph of a root.
   *
   * A failed read keeps the previous graph on the canvas: the error is shown
   * next to it, never instead of it.
   */
  async function loadGraph(
    id: string,
    currentDepth: number,
    currentLimit: number
  ): Promise<void> {
    const current = (graphRequest += 1);
    graphLoading = true;
    graphError = null;

    try {
      const subgraph = await loadSubgraph(api, {
        rootId: id,
        depth: currentDepth,
        limit: currentLimit
      });

      if (current !== graphRequest) {
        return;
      }

      graphNodes = subgraph.nodes;
      graphEdges = subgraph.edges;
      graphLoaded = true;

      // The selection may not exist in the new window.
      dropSelectionOutside(subgraph.nodes, subgraph.edges);
    } catch (caught) {
      if (current !== graphRequest) {
        return;
      }
      if (await redirectToLoginOnAuthFailure(caught, workspace, page.url.pathname)) {
        return;
      }
      graphError = describeFailure(caught, t);
    } finally {
      if (current === graphRequest) {
        graphLoading = false;
      }
    }
  }

  /** Picks the root of the subgraph. */
  function selectRoot(id: string): void {
    rootId = id;
    selection = nodeSelection(id);
  }

  /**
   * Drops the selection when the thing it points at is not in the window.
   *
   * The window changed — a new root, a new depth, the exploration view —
   * and the inspector would show something the picture does not hold.
   */
  function dropSelectionOutside(nodes: NodeDto[], edges: SubgraphEdgeDto[]): void {
    const current = selection;

    if (current === null) {
      return;
    }

    const stillThere =
      current.kind === 'node'
        ? nodes.some((node) => node.id === current.id)
        : edges.some((edge) => edge.id === current.id);

    if (!stillThere) {
      selection = null;
    }
  }

  /**
   * Reads the exploration window of the workspace.
   *
   * A failed read keeps the previous window on the canvas: the error is
   * shown next to it, never instead of it.
   */
  async function loadWindow(): Promise<void> {
    const current = (windowRequest += 1);
    windowLoading = true;
    windowError = null;

    try {
      const answer = await loadNodeWindow(api, { limit: NODE_WINDOW_DEFAULT_LIMIT });

      if (current !== windowRequest) {
        return;
      }

      windowNodes = answer.nodes;
      windowEdges = answer.edges;

      // The selection may not exist in the new window.
      dropSelectionOutside(answer.nodes, answer.edges);
    } catch (caught) {
      if (current !== windowRequest) {
        return;
      }
      if (await redirectToLoginOnAuthFailure(caught, workspace, page.url.pathname)) {
        return;
      }
      windowError = describeFailure(caught, t);
    } finally {
      if (current === windowRequest) {
        windowLoading = false;
      }
    }
  }

  /**
   * Re-reads the score of a relation after the API counted a vote.
   *
   * The API has no read for the interactions, so the client cannot know
   * whether a vote was counted — the same type is idempotent and does not
   * move the counter again. The relation is read back through the subgraph
   * and the ledger adopts the server's number: the server stays the
   * authority.
   */
  async function reconcileEdgeScore(edgeId: string): Promise<number | null> {
    try {
      if (viewMode === 'explore') {
        const answer = await loadNodeWindow(api, { limit: NODE_WINDOW_DEFAULT_LIMIT });
        const edge = answer.edges.find((candidate) => candidate.id === edgeId);

        if (!edge) {
          return null;
        }

        ledger.sync(edgeId, edge.communityScore);
        return edge.communityScore;
      }

      if (rootId === null) {
        return null;
      }

      const subgraph = await loadSubgraph(api, {
        rootId,
        depth,
        limit
      });

      const edge = subgraph.edges.find((candidate) => candidate.id === edgeId);
      if (!edge) {
        return null;
      }

      ledger.sync(edgeId, edge.communityScore);
      return edge.communityScore;
    } catch {
      // The score of the relation stays as it was shown; the vote itself
      // already reported its own outcome.
      return null;
    }
  }

  /** The user selected a node — in the canvas or in the list. */
  function selectNode(id: string | null): void {
    selection = id === null ? null : nodeSelection(id);
  }

  /**
   * The user selected a thing in the list: a node or a relation.
   *
   * The list is the text alternative of the canvas and it offers the same
   * selection: a relation row is selectable too.
   */
  function select(chosen: InspectorSelection | null): void {
    selection = chosen;
  }

  /** Opens the node creation form. */
  function openNodeDialog(): void {
    notice = null;
    nodeDialogOpen = true;
  }

  /** Opens the relation creation form, with the selected node as the source. */
  function openEdgeDialog(node: NodeDto): void {
    notice = null;
    edgeSource = node;
    edgeDialogOpen = true;
  }

  /**
   * The node was created: the list shows it at the top.
   *
   * The creation answers with a projection of the node, so the full node is
   * read back; when that read fails the list is refreshed instead — the node
   * exists either way.
   */
  async function handleNodeCreated(created: CreatedNode): Promise<void> {
    try {
      const node = await getNode(api, created.id);
      rootNodes = [node, ...rootNodes.filter((candidate) => candidate.id !== node.id)];
      notice = { text: t('graph.nodeCreated', { title: node.title }) };
    } catch {
      await loadRoots(null);
      notice = { text: t('graph.nodeCreated', { title: created.title }) };
    }
  }

  /**
   * The relation was created: the subgraph is read again.
   *
   * The canvas shows the window the API answers, never a relation the API
   * did not return: a relation whose endpoints fall outside the current
   * window is simply not in it.
   */
  function handleEdgeCreated(edge: SubgraphEdgeDto): void {
    notice = { text: t('graph.edgeCreated', { relationKey: edge.relationKey }) };

    if (rootId !== null) {
      void loadGraph(rootId, depth, limit);
    }
  }

  /**
   * Opens the correction form on the selected thing.
   *
   * The correction is a **proposal**: it changes nothing until the author
   * of the target approves it. Any member of the workspace may propose
   * one; the API re-checks everything.
   */
  function openCorrection(target: CorrectionTarget): void {
    notice = null;
    correctionTarget = target;
    correctionOpen = true;
  }

  /**
   * The proposal was created: the user is told what happened and where the
   * proposal is.
   *
   * The proposal is `PENDING`: it changes nothing until the author of the
   * target approves it. The link opens it in the proposals screen.
   */
  function handleProposalCreated(created: CreatedProposal): void {
    const current = correctionTarget;

    const subject =
      current === null
        ? t('graph.correctionSubject')
        : current.kind === 'node'
          ? t('graph.nodeCorrectionSubject', { title: current.node.title })
          : t('graph.edgeCorrectionSubject', { relationKey: current.edge.relationKey });

    notice = {
      text: t('graph.proposalCreated', { subject }),
      link: {
        href: `/proposals?proposal=${encodeURIComponent(created.id)}`,
        label: t('graph.openProposal')
      }
    };
  }

  function handleDepthChange(event: Event): void {
    const select = event.currentTarget;
    if (!(select instanceof HTMLSelectElement)) {
      return;
    }
    depth = clampDepth(Number(select.value));
  }

  function handleLimitChange(event: Event): void {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const next = clampSubgraphLimit(Number(input.value));
    input.value = String(next);
    limit = next;
  }

  /**
   * Shows or hides the inspector.
   *
   * One control, two behaviours: in a wide screen it folds the column of
   * the page and in a narrow one it opens the sheet that comes over the
   * content.
   */
  function toggleInspector(): void {
    inspectorOpen = !inspectorOpen;
  }
</script>

<svelte:head>
  <title>{t('graph.pageTitle')}</title>
</svelte:head>

<section class="space-y-6">
  <!--
    The title row.

    The title is the one element of the screen that is set in the serif:
    it says that the page is a document, and the rest of the interface
    stays in the interface face. The one action of the screen — the
    filled button — is at the right of the row.
  -->
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1>{t('graph.heading')}</h1>
      <p class="mt-2 max-w-measure text-body text-muted">
        <RichText
          text={t('graph.intro', {
            maxNodes: formatNumber(locale.locale, SUBGRAPH_MAX_NODES),
            maxDepth: formatNumber(locale.locale, SUBGRAPH_MAX_DEPTH)
          })}
        />
      </p>
    </div>

    <div class="flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        class="btn btn-primary"
        disabled={ontology === null}
        onclick={openNodeDialog}
      >
        {t('graph.newNode')}
      </button>
      {#if ontologyError !== null}
        <p role="alert" class="text-small text-pill-negative-ink">
          <span class="font-mono">{ontologyError.code}</span> — {ontologyError.message}
        </p>
      {:else if ontologyLoading}
        <p class="text-small text-muted">{t('graph.readingOntology')}</p>
      {/if}
    </div>
  </div>

  {#if notice !== null}
    <p role="status" class="rounded-control bg-raised px-4 py-3 text-body">
      {notice.text}
      {#if notice.link}
        <a href={notice.link.href} class="ml-1 underline">{notice.link.label}</a>
      {/if}
    </p>
  {/if}

  <!--
    The canvas and the inspector share the width of the window.

    Above `xl` the inspector is a column of the page and it can be folded
    away: the canvas needs the room to read the titles of the nodes. Below
    `xl` the inspector is a **sheet** that comes over the content: as a
    column it would fall after the whole list of nodes, thousands of pixels
    down, where nobody finds it.
  -->
  <div
    class="grid gap-6 {inspectorWide.matches && inspectorOpen ? 'xl:grid-cols-[minmax(0,1fr)_24rem]' : ''}"
  >
    <div class="min-w-0 space-y-6">
      <!--
        The root picker belongs to the subgraph view: the exploration view
        has no root — it presents a node and lets the user choose which one.
      -->
      {#if viewMode === 'subgraph'}
        <section aria-labelledby="root-picker-heading" class="rounded-card bg-surface p-4">
          <h2 id="root-picker-heading">
            {t('graph.rootHeading')}
          </h2>
          <p class="mt-1 text-body text-muted">
            {t('graph.rootHelp')}
          </p>

          {#if rootsError}
            <p role="alert" class="mt-3 rounded-control bg-pill-negative-bg p-3 text-body text-pill-negative-ink">
              <span class="font-mono">{rootsError.code}</span> — {rootsError.message}
            </p>
          {:else if rootsLoading && rootNodes.length === 0}
            <!--
              The loading state keeps the shape of the list it replaces:
              flat grey bars at the real size of the rows, and no shift when
              the nodes land.
            -->
            <div class="mt-3 space-y-3" role="status" aria-live="polite">
              <span class="sr-only">{t('graph.loadingNodes')}</span>
              {#each [0, 1, 2, 3, 4] as row (row)}
                <div class="skeleton w-full"></div>
              {/each}
            </div>
          {:else if rootNodes.length === 0}
            <p class="mt-3 text-body text-muted">
              {t('graph.noNodes')}
            </p>
          {:else}
            <ul class="mt-3 divide-y divide-rule">
              {#each rootNodes as node (node.id)}
                <li class="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <button
                    type="button"
                    class="rounded-control text-left text-text hover:bg-raised hover:text-accent-ink hover:underline hover:underline-offset-2 aria-[current=true]:font-semibold"
                    aria-current={rootId === node.id ? 'true' : undefined}
                    onclick={() => selectRoot(node.id)}
                  >
                    {node.title}
                  </button>
                  <span class="text-small text-muted">{node.typeKey} · {node.status}</span>
                </li>
              {/each}
            </ul>

            {#if rootCursor !== null}
              <button
                type="button"
                class="btn btn-secondary mt-3"
                disabled={rootsLoading}
                onclick={() => loadRoots(rootCursor)}
              >
                {rootsLoading ? t('common.loading') : t('graph.showOlderNodes')}
              </button>
            {/if}
          {/if}
        </section>
      {/if}

      <section aria-labelledby="canvas-heading" class="rounded-card bg-surface p-4">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="canvas-heading">
            {viewMode === 'explore' ? t('explore.heading') : t('graph.subgraphHeading')}
          </h2>

          <div class="flex flex-wrap items-end gap-3 text-body">
            <!--
              The switch between the two views of the graph. It is a piece of
              the state of the page: the URL stays clean and both views stay
              reachable.

              The radio is the control and the label is its face: the focus
              is shown on the label (`peer-focus-visible`), because the radio
              itself is hidden from the sight.
            -->
            <fieldset>
              <legend class="sr-only">{t('graph.viewModeLabel')}</legend>
              <div class="inline-flex gap-1 rounded-control bg-raised p-1">
                {#each VIEW_MODES as mode (mode)}
                  <input
                    type="radio"
                    id="graph-view-{mode}"
                    name="graph-view-mode"
                    value={mode}
                    class="peer sr-only"
                    bind:group={viewMode}
                  />
                  <label
                    for="graph-view-{mode}"
                    class="pointer-coarse:min-h-11 cursor-pointer rounded-control px-3 py-1.5 text-body font-medium text-muted hover:text-text peer-checked:bg-surface peer-checked:text-text peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
                  >
                    {mode === 'explore' ? t('graph.modeExplore') : t('graph.modeSubgraph')}
                  </label>
                {/each}
              </div>
            </fieldset>

            {#if viewMode === 'subgraph'}
              <div>
                <label for="subgraph-depth" class="block text-small text-muted">
                  {t('graph.depthLabel')}
                </label>
                <select
                  id="subgraph-depth"
                  class="field mt-0.5"
                  value={depth}
                  onchange={handleDepthChange}
                >
                  {#each depthOptions as option (option)}
                    <option value={option}>{option}</option>
                  {/each}
                </select>
              </div>

              <div>
                <label for="subgraph-limit" class="block text-small text-muted">
                  {t('graph.maxNodesLabel')}
                </label>
                <input
                  id="subgraph-limit"
                  type="number"
                  min="1"
                  max={SUBGRAPH_MAX_NODES}
                  class="field mt-0.5 w-24"
                  value={limit}
                  onchange={handleLimitChange}
                />
              </div>
            {/if}

            <!--
              The toggle of the inspector. It is the **same** control in the
              two widths: it folds the column of a wide screen and it opens
              the sheet of a narrow one. It lives in the toolbar because it
              has to be reachable when the panel is closed.
            -->
            <button
              type="button"
              class="btn btn-secondary"
              aria-expanded={inspectorOpen}
              aria-controls={inspectorWide.matches ? INSPECTOR_PANEL_ID : INSPECTOR_SHEET_ID}
              onclick={(event) => {
                // Safari does not focus a button that is clicked: the focus
                // is given to the button by hand, or the panel cannot give
                // it back when it closes.
                event.currentTarget.focus();
                toggleInspector();
              }}
            >
              {inspectorOpen ? t('inspector.collapse') : t('inspector.expand')}
            </button>
          </div>
        </div>

        <p class="mt-1 text-small text-muted">{t('graph.modeHint')}</p>

        {#if viewMode === 'subgraph'}
          <p class="mt-1 text-small text-muted">
            {t('graph.bounds', {
              depth: formatNumber(locale.locale, depth),
              limit: formatNumber(locale.locale, limit),
              maxDepth: formatNumber(locale.locale, SUBGRAPH_MAX_DEPTH),
              maxNodes: formatNumber(locale.locale, SUBGRAPH_MAX_NODES)
            })}
          </p>

          {#if graphError}
            <p role="alert" class="mt-3 rounded-control bg-pill-negative-bg p-3 text-body text-pill-negative-ink">
              <span class="font-mono">{graphError.code}</span> — {graphError.message}
              {#if graphLoaded}
                <span class="mt-1 block text-muted">
                  {t('graph.staleGraph')}
                </span>
              {/if}
            </p>
          {/if}

          <div class="mt-4">
            {#if rootId === null}
              <p class="rounded-card border border-dashed border-border p-4 text-center text-body text-muted">
                {t('graph.pickRoot')}
              </p>
            {:else if graphLoading && !graphLoaded}
              <!--
                The canvas has its own shape: the loading state is the flat
                grey band of the canvas, and the layout does not move when
                the graph lands.
              -->
              <div role="status" aria-live="polite">
                <span class="sr-only">{t('graph.loadingSubgraph')}</span>
                <div class="h-72 rounded-card bg-raised"></div>
              </div>
            {:else if graphLoaded}
              <GraphCanvas
                nodes={graphNodes}
                edges={graphEdges}
                selectedNodeId={selectedNodeId}
                onselect={selectNode}
                description={t('graph.canvasDescription', {
                  nodes: formatNumber(locale.locale, graphNodes.length),
                  edges: formatNumber(locale.locale, graphEdges.length)
                })}
              />
            {/if}
          </div>
        {:else}
          <div class="mt-4">
            <ExplorationView
              nodes={windowNodes}
              edges={windowEdges}
              loading={windowLoading}
              error={windowError}
              selectedNodeId={selectedNodeId}
              onselect={selectNode}
            />
          </div>
        {/if}

        <!--
          The list view is the text alternative of **both** modes: the canvas
          is a picture a screen reader cannot see, and the list carries the
          same content with the same selection.
        -->
        <div class="mt-6">
          {#if viewMode === 'explore'}
            <p class="mb-2 text-small text-muted">{t('graph.exploreListNote')}</p>
          {/if}

          <GraphListView
            summaryKey={viewMode === 'explore' ? 'explore.listSummary' : 'graph.listSummary'}
            nodes={listNodes}
            edges={listEdges}
            {selection}
            onselect={select}
            {ledger}
            reconcileEdge={reconcileEdgeScore}
            onpropose={(edge) => openCorrection({ kind: 'edge', edge })}
          />
        </div>
      </section>
    </div>

    <!--
      The inspector: the one panel of the selected thing. It is shared by
      the two views of the graph.

      It is a **column** of the page in a wide window and a **sheet** over
      the content in a narrow one. Only one of the two is ever in the DOM:
      the inspector carries the ids of its controls.
    -->
    {#if inspectorWide.matches}
      {#if inspectorOpen}
        <div class="min-w-0">
          <Inspector
            {selection}
            nodes={listNodes}
            {ledger}
            panelId={INSPECTOR_PANEL_ID}
            onsuggest={openCorrection}
            onrelate={openEdgeDialog}
            reconcileEdge={reconcileEdgeScore}
          />
        </div>
      {/if}
    {:else}
      <Sheet
        open={inspectorOpen}
        panelId={INSPECTOR_SHEET_ID}
        onclose={() => {
          inspectorOpen = false;
        }}
      >
        <Inspector
          {selection}
          nodes={listNodes}
          {ledger}
          panelId={INSPECTOR_PANEL_ID}
          showHeading={false}
          onsuggest={openCorrection}
          onrelate={openEdgeDialog}
          reconcileEdge={reconcileEdgeScore}
        />
      </Sheet>
    {/if}
  </div>

  <p class="mt-4 text-small text-muted">
    <RichText text={t('graph.apiOrigin', { apiBaseUrl: data.apiBaseUrl })} />
  </p>

  <NodeCreateDialog
    open={nodeDialogOpen}
    {ontology}
    {ontologyError}
    onclose={() => {
      nodeDialogOpen = false;
    }}
    oncreated={handleNodeCreated}
  />

  <EdgeCreateDialog
    open={edgeDialogOpen}
    {ontology}
    source={edgeSource}
    nodes={rootNodes}
    onclose={() => {
      edgeDialogOpen = false;
    }}
    oncreated={handleEdgeCreated}
  />

  <CorrectionDialog
    open={correctionOpen}
    target={correctionTarget}
    {ontology}
    onclose={() => {
      correctionOpen = false;
    }}
    oncreated={handleProposalCreated}
  />
</section>
