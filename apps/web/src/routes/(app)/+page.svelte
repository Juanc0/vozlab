<script lang="ts">
  /**
   * The **graph page** — a workspace, not a page.
   *
   * The area between the bar of the shell and the bottom of the window is
   * the workspace, the page does not scroll, and the canvas is that whole
   * area. The panels of the workspace **float** over the picture: the
   * toolbar at the top, the inspector on the right, and the panel of the
   * mode at the bottom left.
   *
   * The list of the nodes is the **text alternative** of the canvas — a
   * canvas is a picture a screen reader cannot see — and it is the other
   * half of the same area: the toggle of the toolbar swaps the picture and
   * the list.
   */
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
    type CreatedEdge,
    type CreatedNode
  } from '$lib/api/graph';
  import { loadOntology } from '$lib/api/ontology';
  import type { CreatedProposal } from '$lib/api/proposals';
  import type { NodeDto, OntologyResponseDto, SubgraphEdgeDto } from '$lib/api/types';
  import { redirectToLoginOnAuthFailure } from '$lib/auth/require-session';
  import CorrectionDialog from '$lib/components/CorrectionDialog.svelte';
  import EdgeCreateDialog from '$lib/components/EdgeCreateDialog.svelte';
  import ExploreControls from '$lib/components/ExploreControls.svelte';
  import ExplorationView from '$lib/components/ExplorationView.svelte';
  import FloatingPanel from '$lib/components/FloatingPanel.svelte';
  import GraphCanvas from '$lib/components/GraphCanvas.svelte';
  import GraphListView from '$lib/components/GraphListView.svelte';
  import Inspector from '$lib/components/Inspector.svelte';
  import NodeCreateDialog from '$lib/components/NodeCreateDialog.svelte';
  import RootPicker from '$lib/components/RootPicker.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import WorkspaceToolbar from '$lib/components/WorkspaceToolbar.svelte';
  import ZoomControls from '$lib/components/ZoomControls.svelte';
  import type { CorrectionTarget } from '$lib/governance/correction';
  import { VoteLedger } from '$lib/governance/vote.svelte';
  import { formatNumber } from '$lib/i18n';
  import { mergeEdges, mergeNodes, sameIds } from '$lib/graph/merge';
  import type { Neighbourhood } from '$lib/graph/explore/neighbourhood';
  import { presentedNodeId, type FocusCriterion } from '$lib/graph/explore/focus';
  import type { EdgeStyle } from '$lib/graph/explore/edge-style';
  import type { ZoomAction } from '$lib/graph/explore/zoom';
  import type { TranslationKey } from '$lib/i18n';
  import { nodeSelection, edgeSelection, type InspectorSelection } from '$lib/inspector/selection';
  import { MediaQuery } from '$lib/layout/media.svelte';
  import { getApiClient, getLocaleState, getPanelsState, getWorkspaceState } from '$lib/state/context';
  import RichText from '$lib/components/RichText.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const api = getApiClient();
  const workspace = getWorkspaceState();
  const locale = getLocaleState();
  const panels = getPanelsState();
  const t = locale.t;

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
   * The subgraphs the exploration view has **walked** to.
   *
   * The working set of the exploration view is the window plus these: the
   * nodes accumulate, so walking the graph never loses what has been seen.
   */
  let walkNodes = $state.raw<NodeDto[]>([]);
  let walkEdges = $state.raw<SubgraphEdgeDto[]>([]);

  /** Whether a walk is on its way. */
  let walking = $state(false);

  /** The failure of the last walk, if it failed. */
  let walkError = $state<ApiFailure | null>(null);

  /** The node the last walk was about. */
  let walkTargetId = $state<string | null>(null);

  /** The title of the node whose neighbourhood came back empty. */
  let walkIsolatedTitle = $state<string | null>(null);

  /**
   * The **picture** of the exploration view.
   *
   * The view decides what it draws (the whole working set or the
   * neighbourhood of the focus) and tells the page: the list view is the
   * text alternative of the canvas and shows the same picture.
   */
  let pictureNodes = $state.raw<NodeDto[] | null>(null);
  let pictureEdges = $state.raw<SubgraphEdgeDto[] | null>(null);

  /**
   * The view the page shows.
   *
   * It is a piece of the state of the page, not a route: the URL stays
   * clean (FR-04) and both views stay reachable.
   */
  type ViewMode = 'subgraph' | 'explore';
  let viewMode = $state<ViewMode>('explore');
  let searchQuery = $state('');
  let rearrangeTick = $state(0);

  /** The label of every criterion of the focus. */
  const FOCUS_LABELS: Record<FocusCriterion, TranslationKey> = {
    recent: 'explore.focusRecent',
    related: 'explore.focusRelated',
    manual: 'explore.focusManual'
  };

  /**
   * `true` while the **list** is on screen.
   *
   * The list is the text alternative of the canvas, and it is the other
   * half of the workspace: the toggle of the toolbar swaps the picture and
   * the list, and both keep the same working set and the same selection.
   */
  let listOpen = $state(false);

  /** The criterion that decides which node the exploration view presents. */
  let criterion = $state<FocusCriterion>('recent');

  /** The shape the relations are drawn with. */
  let edgeStyle = $state<EdgeStyle>('bezier');

  /**
   * The **zoom** of the picture.
   *
   * It is a property of the **view**, and the view belongs to the reader:
   * it starts at the fit — the whole graph in view — and the wheel (the
   * pinch, the controls of the toolbar) changes it.
   *
   * It lives in the page and not in the canvas, because the two views of
   * the graph are the **same workspace**: the zoom survives the change of
   * the mode, and it starts again at the fit when the page is opened
   * afresh.
   *
   * It is `null` until the **reader chooses** one: a view that opens
   * without a zoom of the reader fits its own picture — the whole graph in
   * view — and the fit is not a choice. Once the reader has chosen one
   * (the wheel, the pinch, the controls), the value is theirs: it survives
   * the growth of the picture, a walk and the change of the mode.
   */
  let viewZoom = $state<number | null>(null);

  /** What the reader asked the zoom to do. */
  let zoomAction = $state<ZoomAction>('in');

  /**
   * The number of the command of the zoom.
   *
   * It is a counter: the reader may ask for the same thing twice, and the
   * second time is a second command.
   */
  let zoomRequest = $state(0);

  /**
   * The reader asks for a zoom.
   *
   * The command is a request: the canvas that is on screen answers it.
   *
   * @param action - What the reader asked for.
   */
  function requestZoom(action: ZoomAction): void {
    zoomAction = action;
    zoomRequest += 1;
  }

  /** The node the user last clicked — the `manual` criterion. */
  let manualNodeId = $state<string | null>(null);

  /**
   * `true` while the panel of the root picker is open.
   *
   * The panel is a **control** of the toolbar: it opens and it closes, and
   * the reader is told which of the two it is. It starts closed — the walk
   * through the graph does not need a list of nodes over it — and the
   * preference is remembered between visits.
   */
  let rootPickerOpen = $state(!panels.rootCollapsed);

  /**
   * The height of the floating toolbar.
   *
   * The list is the other half of the workspace and it must not run under
   * the toolbar: the panel is measured, and the list starts below it.
   */
  let toolbarHeight = $state(0);

  /** The toolbar changed its height. */
  function setToolbarHeight(height: number): void {
    toolbarHeight = height;
  }

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
   * A counter that asks for the subgraph again.
   *
   * A click on the root of the subgraph is a walk too, and the picture
   * has to be asked for again even though the root did not change.
   */
  let graphReload = $state(0);

  /**
   * The node the picture is centred on.
   *
   * A walk lands on a picture that has just been drawn again: the node
   * the reader walked to is the one that has to be in the middle of it.
   */
  let centerNodeId = $state<string | null>(null);

  /** The number of times the picture asked to be centred. */
  let centerRequest = $state(0);

  /** The node whose subgraph is on its way — the canvas centres on it. */
  let pendingCenter = $state<string | null>(null);

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
   * screen it is a panel that floats over the picture, in a narrow one it
   * is the sheet that comes over the content. The width of the window
   * decides which one it is.
   *
   * It starts **folded**: the walk through the graph happens without it,
   * and the reader turns it on when they want to read a thing.
   */
  let inspectorOpen = $state(!panels.inspectorCollapsed);

  /**
   * The width at which the inspector is a panel over the picture.
   *
   * Below it the inspector is a sheet that comes over the content: as a
   * floating panel it would cover the canvas of a phone, where there is
   * no room for it.
   */
  const inspectorWide = new MediaQuery('(min-width: 1280px)');

  /**
   * The width at which the panels of the workspace have their own place.
   *
   * Above it the panel of the mode — the root picker of the subgraph, the
   * readouts of the exploration window — floats at the bottom of the
   * picture. Below it there is no room for a second panel: the readouts
   * live in the toolbar and the root picker starts closed.
   */
  const wideLayout = new MediaQuery('(min-width: 768px)');

  /** The id of the panel of the inspector — the toggle points at it. */
  const INSPECTOR_PANEL_ID = 'vozlab-inspector-panel';

  /** The id of the sheet of the inspector — the toggle points at it. */
  const INSPECTOR_SHEET_ID = 'vozlab-inspector-sheet';

  /** The id of the panel of the root picker — the toggle points at it. */
  const ROOT_PICKER_ID = 'vozlab-root-picker';

  /** The id of the description of the list. */
  const LIST_DESCRIPTION_ID = 'vozlab-list-description';

  onMount(() => {
    inspectorWide.attach();
    wideLayout.attach();

    return () => {
      inspectorWide.destroy();
      wideLayout.destroy();
    };
  });

  /**
   * The inspector follows the width of the window.
   *
   * A wide window shows the panel that floats over the picture and a
   * narrow one shows the sheet, and the sheet starts closed: a panel that
   * covers the whole canvas of a phone the moment it arrives is a panel
   * nobody asked for.
   *
   * The wide panel follows the **preference** of the reader: it is folded
   * until they turn it on, and it is folded again on the next visit.
   */
  $effect(() => {
    const wide = inspectorWide.matches;

    untrack(() => {
      inspectorOpen = wide && !panels.inspectorCollapsed;
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
  let walkRequest = 0;

  /** The selected node — it is the one the canvas and the list highlight. */
  const selectedNodeId = $derived(selection?.kind === 'node' ? selection.id : null);

  /** The selected relation — it is the one the canvas and the list highlight. */
  const selectedEdgeId = $derived(selection?.kind === 'edge' ? selection.id : null);

  /**
   * The **working set** of the exploration view: the window and every
   * subgraph the user has walked to.
   */
  const exploreNodes = $derived(mergeNodes(windowNodes, walkNodes));

  /** The relations of the working set. */
  const exploreEdges = $derived(mergeEdges(windowEdges, walkEdges));

  /** The node the exploration view presents. */
  const explorePresented = $derived(
    presentedNodeId(exploreNodes, exploreEdges, criterion, manualNodeId)
  );

  /** The node the exploration view presents, as a node. */
  const explorePresentedNode = $derived(
    explorePresented === null
      ? null
      : (exploreNodes.find((node) => node.id === explorePresented) ?? null)
  );

  /** The title of the node the walk is about. */
  const walkTargetTitle = $derived(
    walkTargetId === null
      ? null
      : (exploreNodes.find((node) => node.id === walkTargetId)?.title ?? null)
  );

  /**
   * The nodes the list view shows: the ones of the view on screen.
   *
   * The exploration view draws a **picture** — the working set or the
   * neighbourhood of the focus — and the list is its text alternative: it
   * shows the same picture.
   */
  const listNodes = $derived(
    viewMode === 'explore' ? (pictureNodes ?? exploreNodes) : graphNodes
  );

  /** The relations the list view shows: the ones of the view on screen. */
  const listEdges = $derived(
    viewMode === 'explore' ? (pictureEdges ?? exploreEdges) : graphEdges
  );

  /**
   * The width of the floating toolbar.
   *
   * The toolbar gives way to the inspector: a panel that runs under
   * another one is a panel the reader cannot read.
   */
  const toolbarWidth = $derived('w-full');

  /**
   * The room the inspector takes on the right of the list.
   *
   * The inspector floats over the picture; the list is beside it.
   */
  const listRightPadding = $derived(
    inspectorWide.matches && inspectorOpen ? '26rem' : '1rem'
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
    walkNodes = [];
    walkEdges = [];
    walking = false;
    walkError = null;
    walkTargetId = null;
    walkIsolatedTitle = null;
    pictureNodes = null;
    pictureEdges = null;
    centerNodeId = null;
    centerRequest = 0;
    pendingCenter = null;
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

  /**
   * Reads the bounded subgraph of the root.
   *
   * The query is read as a whole: the root, the depth, the budget and the
   * counter of the reloads. A click on the root asks for the same subgraph
   * again, and the counter is what makes the effect run again.
   */
  const graphQuery = $derived({
    id: rootId,
    depth,
    limit,
    reload: graphReload
  });

  $effect(() => {
    const query = graphQuery;

    if (query.id === null || viewMode !== 'subgraph') {
      return;
    }

    void loadGraph(query.id, query.depth, query.limit);
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

      // The picture has just been drawn again: the node the reader walked
      // to is the one that has to be in the middle of it.
      if (pendingCenter !== null) {
        centerNodeId = pendingCenter;
        pendingCenter = null;
        centerRequest += 1;
      }

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
   * The user clicked a node of the canvas: the app **walks** to it.
   *
   * The two views answer the gesture differently:
   *
   * - the exploration view **merges**: the answer of the subgraph rooted at
   *   the clicked node is added to the working set, and the picture grows;
   * - the subgraph view **re-roots**: a subgraph *is* a neighbourhood and a
   *   neighbourhood has a root, so the answer replaces the picture.
   *
   * Either way it is **one full request per click**: the subgraph rooted at
   * the clicked node, at the depth that is selected.
   */
  function navigateTo(nodeId: string): void {
    if (viewMode === 'explore') {
      // The walk is a choice of the user: the node it goes to is the one
      // the view presents from now on.
      selection = nodeSelection(nodeId);

      void walkTo(nodeId);
      return;
    }

    // The picture is centred on the node when the new subgraph lands.
    pendingCenter = nodeId;

    selectRoot(nodeId);

    // The root may not have changed: the counter asks for the picture
    // again anyway.
    graphReload += 1;
  }

  /**
   * Walks to a node: the subgraph rooted at it, at the selected depth.
   *
   * The picture stays on screen while the answer is on its way: a canvas
   * that empties and refills on every click feels broken. The answer is
   * **merged** into the working set — what has been seen is never lost.
   */
  async function walkTo(nodeId: string): Promise<void> {
    const current = (walkRequest += 1);
    walking = true;
    walkError = null;
    walkIsolatedTitle = null;
    walkTargetId = nodeId;

    try {
      const subgraph = await loadSubgraph(api, {
        rootId: nodeId,
        depth,
        limit
      });

      if (current !== walkRequest) {
        return;
      }

      walkNodes = mergeNodes(walkNodes, subgraph.nodes);
      walkEdges = mergeEdges(walkEdges, subgraph.edges);

      // A node without relations is not a failure: its neighbourhood came
      // back empty, and the interface has to say so instead of showing an
      // error.
      if (subgraph.nodes.length === 1 && subgraph.edges.length === 0) {
        walkIsolatedTitle =
          subgraph.nodes[0]?.title ?? t('graph.unknownNode');
      }
    } catch (caught) {
      if (current !== walkRequest) {
        return;
      }
      if (await redirectToLoginOnAuthFailure(caught, workspace, page.url.pathname)) {
        return;
      }
      walkError = describeFailure(caught, t);
    } finally {
      if (current === walkRequest) {
        walking = false;
      }
    }
  }

  /**
   * The exploration view says what it draws.
   *
   * The list view is the text alternative of the canvas: it shows the same
   * picture. The state only moves when the picture really changed.
   */
  function reportPicture(picture: Neighbourhood): void {
    if (!sameIds(pictureNodes, picture.nodes)) {
      pictureNodes = picture.nodes;
    }

    if (!sameIds(pictureEdges, picture.edges)) {
      pictureEdges = picture.edges;
    }
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

  /**
   * The user selected a node — in the canvas or in the list.
   *
   * A click **is** the user choosing: the criterion of the focus switches
   * to the one they picked, or the view would present another node the
   * moment the criterion is evaluated again.
   */
  function selectNode(id: string | null): void {
    if (id !== null) {
      manualNodeId = id;
      criterion = 'manual';
    }

    selection = id === null ? null : nodeSelection(id);
  }

  /**
   * The user selected a relation — by tapping its card in the canvas.
   *
   * The relation is one of the window: the canvas draws it and the
   * inspector reads it whole.
   */
  function selectEdge(id: string): void {
    selection = edgeSelection(id);
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
  function handleEdgeCreated(edge: CreatedEdge): void {
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

  /**
   * The depth of a walk is the depth of the whole app.
   *
   * The exploration view and the subgraph view share the number: the
   * neighbourhood a click asks for and the subgraph of the other view are
   * bounded by the same depth.
   */
  function setDepth(value: number): void {
    depth = clampDepth(value);
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

  /** The user changed the view of the graph. */
  function setViewMode(mode: ViewMode): void {
    viewMode = mode;
  }

  /**
   * The user swapped the picture for the list, or the list for the picture.
   *
   * The panel of the root picker folds away with the picture: it is a
   * control of the picture, and a list that runs under a floating panel is
   * a list the reader cannot click. The toolbar opens it again.
   */
  function toggleList(): void {
    listOpen = !listOpen;

    if (listOpen) {
      rootPickerOpen = false;
    }
  }

  /** The user folded or opened the inspector. */
  function toggleInspector(): void {
    inspectorOpen = !inspectorOpen;

    // The preference is remembered: the next visit finds the inspector as
    // the reader left it.
    panels.setInspectorCollapsed(!inspectorOpen);
  }

  /** The user folded or opened the panel of the root picker. */
  function toggleRootPicker(): void {
    rootPickerOpen = !rootPickerOpen;

    // The preference is remembered: the next visit finds the panel as the
    // reader left it.
    panels.setRootCollapsed(!rootPickerOpen);
  }

</script>

<svelte:head>
  <title>{t('graph.pageTitle')}</title>
</svelte:head>

<!--
  The readouts of the exploration window: what the picture is and what it
  is not. They live in the toolbar on a narrow screen and in a panel of
  their own on a wide one.
-->
{#snippet exploreReadout()}
  <p class="text-small text-muted">
    <RichText text={t('explore.windowNote', { max: formatNumber(locale.locale, 200) })} />
  </p>

  <!--
    The node the view presents and the criterion in force. On a narrow
    screen the canvas wears the ring of the node and the control wears the
    criterion: the lines would be a fourth of the picture.
  -->
  {#if explorePresentedNode !== null}
    <p class="hidden text-small text-muted min-[48rem]:block">
      {t('explore.presented', { title: explorePresentedNode.title })}
    </p>
  {/if}

  <p class="hidden text-small text-muted min-[48rem]:block">
    {t('explore.focusActive', { label: t(FOCUS_LABELS[criterion]) })}
  </p>

  <!--
    The counts of the picture: how many nodes and how many relations are on
    it. They are the truth — the picture is the whole working set, and
    nothing that has been seen can be taken off it.
  -->
  <p id="explore-scope-count" class="text-small text-muted">
    {t('explore.scopeAll', {
      nodes: formatNumber(locale.locale, pictureNodes?.length ?? exploreNodes.length),
      relations: formatNumber(locale.locale, pictureEdges?.length ?? exploreEdges.length)
    })}
  </p>

  <p class="hidden text-small text-muted min-[48rem]:block">
    {t('explore.hint')}
  </p>
{/snippet}

<!--
  The **workspace**: the window is the page.

  The canvas is the whole area, with an even ground — no grid, no dots,
  no texture — and the panels float over it. The page does not scroll.
-->
<div class="relative h-full w-full overflow-hidden bg-ground">
  <!--
    The picture — or the list, which is its **text alternative**. They
    share the same area: the toggle of the toolbar swaps them, and both
    carry the same working set and the same selection.

    The canvas stays in the document when the list is on screen: the
    picture keeps the zoom and the place the reader left it.
  -->
  <div
    class="absolute inset-0"
    class:invisible={listOpen}
    aria-hidden={listOpen ? 'true' : undefined}
    inert={listOpen}
  >
    <ExplorationView
      nodes={exploreNodes}
      edges={exploreEdges}
      onwalk={navigateTo}
      {walking}
      onpicture={reportPicture}
      loading={windowLoading}
      error={windowError}
      selectedNodeId={selectedNodeId}
      selectedEdgeId={selectedEdgeId}
      onselect={selectNode}
      onselectedge={selectEdge}
      presentedNodeId={explorePresented}
      {edgeStyle}
      {rearrangeTick}
      zoom={viewZoom}
      onzoomchange={(next, source) => {
        // Only the choice of the reader is kept: the fit of a view is
        // the zoom that picture starts with, not a choice.
        if (source === 'reader') {
          viewZoom = next;
        }
      }}
      zoomaction={zoomAction}
      zoomrequest={zoomRequest}
    />
  </div>

  <!--
    The list: the text alternative of the picture, in the same area. It is
    a real DOM list and it scrolls inside itself — never the page.

    It starts **below the toolbar** and ends **before the inspector**: a
    list that runs under a floating panel is a list the reader cannot
    click.
  -->
  {#if listOpen}
    <div
      class="absolute inset-0 overflow-y-auto bg-ground pl-4"
      style="padding-top: {toolbarHeight + 32}px; padding-right: {listRightPadding}; padding-bottom: calc(var(--notice-h, 0px) + 1rem)"
    >
      <GraphListView
        summaryKey={viewMode === 'explore' ? 'explore.listSummary' : 'graph.listSummary'}
        nodes={listNodes}
        edges={listEdges}
        {selection}
        onselect={select}
        onnavigate={navigateTo}
        {ledger}
        reconcileEdge={reconcileEdgeScore}
        onpropose={(edge) => openCorrection({ kind: 'edge', edge })}
      />
    </div>
  {/if}

  <!--
    The **floating toolbar**: the frame of the picture. It holds the title,
    the switch between the two views and the controls of the view on screen.
  -->
  <WorkspaceToolbar
    {viewMode}
    onviewmodechange={setViewMode}
    {listOpen}
    onlisttoggle={toggleList}
    {inspectorOpen}
    oninspectortoggle={toggleInspector}
    inspectorControlsId={inspectorWide.matches ? INSPECTOR_PANEL_ID : INSPECTOR_SHEET_ID}
    newNodeDisabled={ontology === null}
    onnewnode={openNodeDialog}
    listDescriptionId={LIST_DESCRIPTION_ID}
    panelClass={toolbarWidth}
    onheight={setToolbarHeight}
  >
    {#snippet controls()}
      <!--
        Encontrar un nodo es la acción más usada del lienzo: la búsqueda va
        primero, a la izquierda de la fila de controles.
      -->
      <div class="min-w-0 shrink-0">
        <label for="node-search" class="block text-small text-muted">
          Buscar nodo
        </label>
        <input
          id="node-search"
          type="search"
          class="field mt-0.5 w-56"
          placeholder="Título…"
          bind:value={searchQuery}
          onkeydown={(event) => {
            if (event.key !== 'Enter') {
              return;
            }

            const query = searchQuery.trim().toLowerCase();

            if (query === '') {
              return;
            }

            const match = exploreNodes.find((node) =>
              node.title.toLowerCase().includes(query)
            );

            if (match !== undefined) {
              navigateTo(match.id);
            }
          }}
        />
      </div>

      <ExploreControls
        {criterion}
        oncriterionchange={(next) => {
          criterion = next;
        }}
        {edgeStyle}
        onedgestylechange={(next) => {
          edgeStyle = next;
        }}
        {depth}
        ondepthchange={setDepth}
        onzoomin={() => requestZoom('in')}
        onzoomout={() => requestZoom('out')}
        onfit={() => requestZoom('fit')}
      />

      <!--
        Reordenar el lienzo es una acción de la vista, no del lector: va al
        final del conjunto, separada de la búsqueda y de los controles.
      -->
      <button
        type="button"
        class="btn btn-secondary shrink-0"
        onclick={() => {
          rearrangeTick += 1;
        }}
      >
        Desenredar
      </button>
    {/snippet}

    {#snippet status()}
      {#if graphError}
        <p
          role="alert"
          class="rounded-control bg-pill-negative-bg p-3 text-body text-pill-negative-ink"
        >
          <span class="font-mono">{graphError.code}</span> — {graphError.message}
          {#if graphLoaded}
            <span class="mt-1 block text-muted">
              {t('graph.staleGraph')}
            </span>
          {/if}
        </p>
      {/if}

      {#if windowError}
        <p
          role="alert"
          class="rounded-control bg-pill-negative-bg p-3 text-body text-pill-negative-ink"
        >
          <span class="font-mono">{windowError.code}</span> — {windowError.message}
        </p>
      {/if}

      {#if walkError}
        <p
          role="alert"
          class="rounded-control bg-pill-negative-bg p-3 text-body text-pill-negative-ink"
        >
          <span class="font-mono">{walkError.code}</span> — {walkError.message}
        </p>
      {/if}

      <!--
        A node without relations is not a failure: its neighbourhood came
        back empty, and the interface says so instead of showing an error.
      -->
      {#if walkIsolatedTitle !== null}
        <p class="rounded-control bg-raised p-3 text-body">
          {t('explore.isolated', { title: walkIsolatedTitle })}
        </p>
      {/if}

      {#if ontologyError !== null}
        <p role="alert" class="text-small text-pill-negative-ink">
          <span class="font-mono">{ontologyError.code}</span> — {ontologyError.message}
        </p>
      {:else if ontologyLoading}
        <p class="text-small text-muted">{t('graph.readingOntology')}</p>
      {/if}

      <!--
        The state of a walk: it is said out loud, and the region is always
        in the document — a live region that appears with its text is not
        announced by every reader.
      -->
      <p aria-live="polite" class="sr-only">
        {#if walking}
          {t('explore.walking', { title: walkTargetTitle ?? '' })}
        {/if}
      </p>

      <!--
        The outcome of the last creation. The region is always in the
        document: a live region that appears with its text is not
        announced by every reader.
      -->
      <p role="status" class="text-body">
        {notice?.text ?? ''}
        {#if notice?.link}
          <a href={notice.link.href} class="ml-1 underline">{notice.link.label}</a>
        {/if}
      </p>
    {/snippet}

    {#snippet readout()}
      {#if viewMode === 'subgraph'}
        <p class="mt-1 text-small text-muted">
          {t('graph.bounds', {
            depth: formatNumber(locale.locale, depth),
            limit: formatNumber(locale.locale, limit),
            maxDepth: formatNumber(locale.locale, SUBGRAPH_MAX_DEPTH),
            maxNodes: formatNumber(locale.locale, SUBGRAPH_MAX_NODES)
          })}
        </p>
      {:else if !wideLayout.matches}
        <!--
          On a narrow screen there is no room for a second panel: the
          readouts of the picture live in the toolbar.
        -->
        {@render exploreReadout()}
      {/if}
    {/snippet}
  </WorkspaceToolbar>

  <!--
    The **inspector**: the panel of the selected thing, shared by the two
    views of the graph.

    In a wide window it is a panel that **floats** over the picture: the
    canvas keeps its size, and the picture stays where the reader left it.
    In a narrow one it is the sheet that comes over the content.
  -->
  {#if inspectorWide.matches}
    {#if inspectorOpen}
      <FloatingPanel
        id={INSPECTOR_PANEL_ID}
        placement="top-right"
        panelClass="w-[min(24rem,calc(100%-2rem))] max-h-[calc(100%-var(--notice-h,0px)-2rem)] overflow-y-auto p-3"
        style="top: {toolbarHeight + 16}px"
      >
        <Inspector
          {selection}
          nodes={listNodes}
          {ledger}
          panelId={`${INSPECTOR_PANEL_ID}-tabpanel`}
          flat
          oncollapse={() => {
            inspectorOpen = false;
          }}
          onsuggest={openCorrection}
          onrelate={openEdgeDialog}
          reconcileEdge={reconcileEdgeScore}
        />
      </FloatingPanel>
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
        panelId={`${INSPECTOR_PANEL_ID}-tabpanel`}
        showHeading={false}
        oncollapse={() => {
          inspectorOpen = false;
        }}
        onsuggest={openCorrection}
        onrelate={openEdgeDialog}
        reconcileEdge={reconcileEdgeScore}
      />
    </Sheet>
  {/if}

  {#if !inspectorOpen}
    <button
      type="button"
      class="pointer-events-auto absolute right-4 top-4 z-10 btn btn-secondary"
      aria-expanded={inspectorOpen}
      aria-controls={inspectorWide.matches ? INSPECTOR_PANEL_ID : INSPECTOR_SHEET_ID}
      onclick={() => {
        inspectorOpen = true;
      }}
    >
      {t('inspector.expand')}
    </button>
  {/if}

  <!--
    The panel of the **mode**: the root picker of the subgraph, and the
    readouts of the exploration window. It is at the other end of the
    picture from the inspector.
  -->
  {#if viewMode === 'subgraph'}
    <FloatingPanel
      id={ROOT_PICKER_ID}
      placement="bottom-left"
      label={t('graph.rootPanelLabel')}
      panelClass="w-[min(20rem,calc(100%-2rem))] max-h-[calc(100%-var(--notice-h,0px)-18rem)] overflow-y-auto"
      hidden={!rootPickerOpen}
    >
      <RootPicker
        nodes={rootNodes}
        {rootId}
        loading={rootsLoading}
        error={rootsError}
        hasMore={rootCursor !== null}
        onselect={selectRoot}
        onmore={() => {
          if (rootCursor !== null) {
            void loadRoots(rootCursor);
          }
        }}
      />

      <p class="border-t border-rule px-3 py-2 text-small text-muted">
        <RichText text={t('graph.apiOrigin', { apiBaseUrl: data.apiBaseUrl })} />
      </p>
    </FloatingPanel>
  {/if}


  <!--
    The description of the list: what the alternative is and why it is
    there. It is read by the screen reader when the toggle is announced.
  -->
  <p id={LIST_DESCRIPTION_ID} class="sr-only">
    <RichText
      text={t('graph.intro', {
        maxNodes: formatNumber(locale.locale, SUBGRAPH_MAX_NODES),
        maxDepth: formatNumber(locale.locale, SUBGRAPH_MAX_DEPTH)
      })}
    />
  </p>
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
