<script lang="ts">
  import { page } from '$app/state';
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import {
    NODE_LIST_DEFAULT_LIMIT,
    SUBGRAPH_DEFAULT_DEPTH,
    SUBGRAPH_DEFAULT_NODES,
    SUBGRAPH_MAX_DEPTH,
    SUBGRAPH_MAX_NODES,
    clampDepth,
    clampSubgraphLimit,
    getNode,
    listWorkspaceNodes,
    loadSubgraph,
    type CreatedNode
  } from '$lib/api/graph';
  import { loadOntology } from '$lib/api/ontology';
  import type { CreatedProposal } from '$lib/api/proposals';
  import type { NodeDto, OntologyResponseDto, SubgraphEdgeDto } from '$lib/api/types';
  import { redirectToLoginOnAuthFailure } from '$lib/auth/require-session';
  import CorrectionDialog from '$lib/components/CorrectionDialog.svelte';
  import EdgeCreateDialog from '$lib/components/EdgeCreateDialog.svelte';
  import GraphCanvas from '$lib/components/GraphCanvas.svelte';
  import GraphListView from '$lib/components/GraphListView.svelte';
  import NodeCreateDialog from '$lib/components/NodeCreateDialog.svelte';
  import NodeDetailsPanel from '$lib/components/NodeDetailsPanel.svelte';
  import type { CorrectionTarget } from '$lib/governance/correction';
  import { VoteLedger } from '$lib/governance/vote.svelte';
  import { formatNumber } from '$lib/i18n';
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

  /** The session-local state of the votes on the relations. */
  const ledger = new VoteLedger();
  let graphLoaded = $state(false);
  let graphLoading = $state(false);
  let graphError = $state<ApiFailure | null>(null);

  /** The root of the subgraph and the bounds of the query. */
  let rootId = $state<string | null>(null);
  let depth = $state(SUBGRAPH_DEFAULT_DEPTH);
  let limit = $state(SUBGRAPH_DEFAULT_NODES);

  /** The selected node — the one the details panel shows. */
  let selectedNodeId = $state<string | null>(null);

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

  /** The selected node of the current subgraph. */
  const selectedNode = $derived(
    graphNodes.find((node) => node.id === selectedNodeId) ?? null
  );

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

    rootId = null;
    selectedNodeId = null;
    graphNodes = [];
    graphEdges = [];
    graphLoaded = false;
    graphError = null;
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
      if (selectedNodeId !== null && !subgraph.nodes.some((node) => node.id === selectedNodeId)) {
        selectedNodeId = null;
      }
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
    selectedNodeId = id;
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
    if (rootId === null) {
      return null;
    }

    try {
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
    selectedNodeId = id;
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

  /** Opens the correction form on a node. */
  function openNodeCorrection(node: NodeDto): void {
    notice = null;
    correctionTarget = { kind: 'node', node };
    correctionOpen = true;
  }

  /** Opens the correction form on a relation. */
  function openEdgeCorrection(edge: SubgraphEdgeDto): void {
    notice = null;
    correctionTarget = { kind: 'edge', edge };
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
</script>

<svelte:head>
  <title>{t('graph.pageTitle')}</title>
</svelte:head>

<section class="space-y-6">
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">{t('graph.heading')}</h1>
      <p class="mt-2 max-w-prose text-ink-muted">
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
        class="rounded-md bg-brand-900 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={ontology === null}
        onclick={openNodeDialog}
      >
        {t('graph.newNode')}
      </button>
      {#if ontologyError !== null}
        <p role="alert" class="text-xs text-negative">
          <span class="font-mono">{ontologyError.code}</span> — {ontologyError.message}
        </p>
      {:else if ontologyLoading}
        <p class="text-xs text-ink-muted">{t('graph.readingOntology')}</p>
      {/if}
    </div>
  </div>

  {#if notice !== null}
    <p role="status" class="rounded-md border border-line bg-surface px-4 py-3 text-sm">
      {notice.text}
      {#if notice.link}
        <a href={notice.link.href} class="ml-1 underline">{notice.link.label}</a>
      {/if}
    </p>
  {/if}

  <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
    <div class="min-w-0 space-y-6">
      <section aria-labelledby="root-picker-heading" class="rounded-card border border-line bg-surface p-4">
        <h2 id="root-picker-heading" class="text-base font-semibold tracking-tight">
          {t('graph.rootHeading')}
        </h2>
        <p class="mt-1 text-sm text-ink-muted">
          {t('graph.rootHelp')}
        </p>

        {#if rootsError}
          <p role="alert" class="mt-3 rounded-md border border-negative/30 bg-negative/5 p-3 text-sm">
            <span class="font-mono">{rootsError.code}</span> — {rootsError.message}
          </p>
        {:else if rootsLoading && rootNodes.length === 0}
          <p role="status" class="mt-3 text-sm text-ink-muted">{t('graph.loadingNodes')}</p>
        {:else if rootNodes.length === 0}
          <p class="mt-3 text-sm text-ink-muted">
            {t('graph.noNodes')}
          </p>
        {:else}
          <ul class="mt-3 divide-y divide-line">
            {#each rootNodes as node (node.id)}
              <li class="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <button
                  type="button"
                  class="rounded text-left text-brand-900 underline decoration-brand-300 underline-offset-2 hover:decoration-brand-700 aria-[current=true]:font-semibold"
                  aria-current={rootId === node.id ? 'true' : undefined}
                  onclick={() => selectRoot(node.id)}
                >
                  {node.title}
                </button>
                <span class="text-xs text-ink-muted">{node.typeKey} · {node.status}</span>
              </li>
            {/each}
          </ul>

          {#if rootCursor !== null}
            <button
              type="button"
              class="mt-3 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
              disabled={rootsLoading}
              onclick={() => loadRoots(rootCursor)}
            >
              {rootsLoading ? t('common.loading') : t('graph.showOlderNodes')}
            </button>
          {/if}
        {/if}
      </section>

      <section aria-labelledby="canvas-heading" class="rounded-card border border-line bg-surface p-4">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="canvas-heading" class="text-base font-semibold tracking-tight">
            {t('graph.subgraphHeading')}
          </h2>

          <div class="flex flex-wrap items-end gap-3 text-sm">
            <div>
              <label for="subgraph-depth" class="block text-xs text-ink-muted">
                {t('graph.depthLabel')}
              </label>
              <select
                id="subgraph-depth"
                class="mt-0.5 rounded-md border border-line-strong bg-surface px-2 py-1 text-sm text-ink"
                value={depth}
                onchange={handleDepthChange}
              >
                {#each depthOptions as option (option)}
                  <option value={option}>{option}</option>
                {/each}
              </select>
            </div>

            <div>
              <label for="subgraph-limit" class="block text-xs text-ink-muted">
                {t('graph.maxNodesLabel')}
              </label>
              <input
                id="subgraph-limit"
                type="number"
                min="1"
                max={SUBGRAPH_MAX_NODES}
                class="mt-0.5 w-24 rounded-md border border-line-strong bg-surface px-2 py-1 text-sm text-ink"
                value={limit}
                onchange={handleLimitChange}
              />
            </div>
          </div>
        </div>

        <p class="mt-1 text-xs text-ink-muted">
          {t('graph.bounds', {
            depth: formatNumber(locale.locale, depth),
            limit: formatNumber(locale.locale, limit),
            maxDepth: formatNumber(locale.locale, SUBGRAPH_MAX_DEPTH),
            maxNodes: formatNumber(locale.locale, SUBGRAPH_MAX_NODES)
          })}
        </p>

        {#if graphError}
          <p role="alert" class="mt-3 rounded-md border border-negative/30 bg-negative/5 p-3 text-sm">
            <span class="font-mono">{graphError.code}</span> — {graphError.message}
            {#if graphLoaded}
              <span class="mt-1 block text-ink-muted">
                {t('graph.staleGraph')}
              </span>
            {/if}
          </p>
        {/if}

        <div class="mt-4">
          {#if rootId === null}
            <p class="rounded-card border border-dashed border-line p-6 text-center text-sm text-ink-muted">
              {t('graph.pickRoot')}
            </p>
          {:else if graphLoading && !graphLoaded}
            <p role="status" class="rounded-card border border-dashed border-line p-6 text-center text-sm text-ink-muted">
              {t('graph.loadingSubgraph')}
            </p>
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

            <div class="mt-6">
              <GraphListView
                nodes={graphNodes}
                edges={graphEdges}
                selectedNodeId={selectedNodeId}
                onselect={selectNode}
                {ledger}
                reconcileEdge={reconcileEdgeScore}
                onpropose={openEdgeCorrection}
              />
            </div>
          {/if}
        </div>
      </section>
    </div>

    <aside aria-labelledby="details-heading" class="min-w-0">
      <section class="rounded-card border border-line bg-surface p-4">
        <h2 id="details-heading" class="text-base font-semibold tracking-tight">
          {t('graph.nodeDetailsHeading')}
        </h2>
        <div class="mt-3">
          <NodeDetailsPanel
            node={selectedNode}
            onrelate={openEdgeDialog}
            onsuggest={openNodeCorrection}
          />
        </div>
      </section>

      <p class="mt-4 text-xs text-ink-muted">
        <RichText text={t('graph.apiOrigin', { apiBaseUrl: data.apiBaseUrl })} />
      </p>
    </aside>
  </div>

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
