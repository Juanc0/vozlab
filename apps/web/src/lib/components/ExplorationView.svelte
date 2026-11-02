<script lang="ts">
  /**
   * The **picture** of the exploration view.
   *
   * The view draws the workspace as a landscape: the newest nodes of the
   * window and the relations among them, plus every subgraph the user has
   * walked to. It is the canvas and nothing else — the controls of the
   * view live in the floating toolbar, over the picture, and the readouts
   * live in the panel at the other end of the workspace.
   *
   * The picture never empties while a walk is on its way: the old one
   * stays until the new one is ready, the region is `aria-busy` and a
   * polite live region says what is happening.
   */
  import { untrack } from 'svelte';
  import type { ApiFailure } from '$lib/api/failure';
  import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
  import ExplorationCanvas from '$lib/components/ExplorationCanvas.svelte';
  import type { EdgeStyle } from '$lib/graph/explore/edge-style';
  import { filterNeighbourhood, type Neighbourhood } from '$lib/graph/explore/neighbourhood';
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
    /** The depth of a walk — it bounds the neighbourhood of the focus. */
    depth?: number;
    /**
     * Called when the user **walks** to a node of the canvas.
     *
     * The app asks the API for the subgraph rooted at that node, at the
     * selected depth, and merges the answer into the working set.
     */
    onwalk?: (nodeId: string) => void;
    /** Whether a walk is on its way. */
    walking?: boolean;
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
    /** The id of the node the view presents. */
    presentedNodeId?: string | null;
    /** The shape the relations are drawn with. */
    edgeStyle?: EdgeStyle;
    /** Whether the picture shows only the neighbourhood of the focus. */
    onlyNeighbourhood?: boolean;
  }

  let {
    nodes = [],
    edges = [],
    depth = 1,
    onwalk,
    walking = false,
    onpicture,
    selectedNodeId = null,
    selectedEdgeId = null,
    onselect,
    onselectedge,
    loading = false,
    error = null,
    presentedNodeId = null,
    edgeStyle = 'bezier',
    onlyNeighbourhood = false
  }: Props = $props();

  const locale = getLocaleState();
  const t = locale.t;

  /**
   * The nodes that are drawn as a card.
   *
   * The expansion is a matter of the **picture**: it is not a state of the
   * workspace and it is gone when the picture is drawn again.
   */
  let expandedIds = $state.raw<Set<string>>(new Set<string>());

  /**
   * The nodes the user **collapsed**.
   *
   * An explicit choice of the user beats the default: the node the view
   * presents is expanded on its own, and the user may close it.
   */
  let collapsed = $state.raw<Set<string>>(new Set<string>());

  /**
   * The relations that are drawn as a card with their whole content.
   *
   * A relation of the window carries its attributes, its author and its
   * date: the reader can ask for the whole of it, exactly as he asks for
   * the whole of a node.
   */
  let expandedEdgeIds = $state.raw<Set<string>>(new Set<string>());

  /**
   * The nodes that are drawn as a card — the user's choices and the node
   * the view presents.
   *
   * The node the view presents is expanded **with the first picture**: the
   * expansion is part of the drawing, not a change of it. A picture that is
   * drawn twice — once without the card and once with it — is a picture
   * that jumps under the reader's feet.
   */
  let lastShown: Set<string> | null = null;

  const shown = $derived.by<Set<string>>(() => {
    const next = new Set(expandedIds);

    if (presentedNodeId !== null && !collapsed.has(presentedNodeId)) {
      next.add(presentedNodeId);
    }

    // The same set when nothing changed: the canvas must not draw the
    // picture again for a set that holds the same nodes.
    if (lastShown !== null && sameSet(lastShown, next)) {
      return lastShown;
    }

    lastShown = next;

    return next;
  });

  /** Whether two sets hold the same ids. */
  function sameSet(current: Set<string>, next: Set<string>): boolean {
    if (current.size !== next.size) {
      return false;
    }

    for (const id of current) {
      if (!next.has(id)) {
        return false;
      }
    }

    return true;
  }

  /** The user expanded or collapsed a node. */
  function toggleNode(nodeId: string): void {
    const next = new Set(expandedIds);
    const closed = new Set(collapsed);

    if (next.has(nodeId)) {
      next.delete(nodeId);
      closed.add(nodeId);
    } else {
      next.add(nodeId);
      closed.delete(nodeId);
    }

    expandedIds = next;
    collapsed = closed;
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

  /** The last node the view presented. */
  let lastPresented: string | null = null;

  /**
   * The presented node is **expanded**.
   *
   * The view presents a node and shows it: a card the reader can read from
   * the picture itself. The expansion is remembered, so the node stays a
   * card when the view presents another one — but the card is drawn with
   * the **first** picture (see {@link shown}), so the picture is not drawn
   * twice.
   */
  $effect(() => {
    const current = presentedNodeId;

    if (current === null || current === lastPresented) {
      return;
    }

    lastPresented = current;

    untrack(() => {
      expandedIds = new Set([...expandedIds, current]);
    });
  });

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

    return filterNeighbourhood(nodes, edges, presentedNodeId, depth);
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
</script>

<!--
  The state of a walk is something the reader has to **hear**, and the live
  region that says it lives in the toolbar: it is always in the document,
  and it is never hidden with the picture.
-->
<div aria-busy={walking} class="h-full w-full">
  {#if loading && nodes.length === 0}
    <p
      role="status"
      class="grid h-full place-items-center rounded-card border border-dashed border-border p-4 text-center text-body text-muted"
    >
      {t('explore.loading')}
    </p>
  {:else if nodes.length === 0 && error === null}
    <p
      class="grid h-full place-items-center rounded-card border border-dashed border-border p-4 text-center text-body text-muted"
    >
      {t('explore.empty')}
    </p>
  {:else}
    <ExplorationCanvas
      nodes={picture.nodes}
      edges={picture.edges}
      expandedIds={shown}
      {expandedEdgeIds}
      {edgeStyle}
      {selectedNodeId}
      {selectedEdgeId}
      {presentedNodeId}
      onselect={onselect}
      onnavigate={(nodeId) => onwalk?.(nodeId)}
      ontoggle={toggleNode}
      onselectedge={(edgeId) => onselectedge?.(edgeId)}
      ontoggleedge={toggleEdge}
    />
  {/if}
</div>
