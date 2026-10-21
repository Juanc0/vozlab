<script lang="ts">
  /**
   * The inspector: one right-hand column, four tabs, shared by both graph
   * views.
   *
   * The selection is a **union** — a node or a relation — and the column
   * shows whichever is selected. A relation is **not** in the subgraph
   * response (the subgraph carries the topology only), so the inspector
   * reads the relation itself with `GET /api/v1/edges/:id` when a relation
   * is selected: the attributes, the author pseudonym and the status are
   * only in the relation itself.
   *
   * The column is **collapsible**: the canvas needs the room, and the
   * toggle announces its state (`aria-expanded`).
   *
   * The toggle itself belongs to the page: it is the same control in a wide
   * screen (it folds the column) and in a narrow one (it opens the sheet),
   * and it has to be reachable when the panel is closed.
   *
   * The tabs are a real tablist: the arrow keys move between them, the
   * selected one is the only one in the tab order, and the panel is
   * labelled by the tab it shows.
   */
  import { page } from '$app/state';
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import { getEdge } from '$lib/api/graph';
  import type { EdgeDto, NodeDto } from '$lib/api/types';
  import { redirectToLoginOnAuthFailure } from '$lib/auth/require-session';
  import type { CorrectionTarget } from '$lib/governance/correction';
  import type { VoteLedger } from '$lib/governance/vote.svelte';
  import type { TranslationKey } from '$lib/i18n';
  import { selectionTargetType, type InspectorSelection } from '$lib/inspector/selection';
  import { getApiClient, getLocaleState, getWorkspaceState } from '$lib/state/context';
  import DiscussionPanel from './DiscussionPanel.svelte';
  import InspectorAttributes from './InspectorAttributes.svelte';
  import InspectorContent from './InspectorContent.svelte';
  import InspectorProposals from './InspectorProposals.svelte';

  interface Props {
    /** The selected thing — a node, a relation, or nothing. */
    selection: InspectorSelection | null;
    /** The nodes of the view on screen — the ends of a relation are among them. */
    nodes?: NodeDto[];
    /** The session-local state of the votes. */
    ledger: VoteLedger;
    /**
     * The id of the panel of the tabs.
     *
     * The control that opens the inspector points at it with
     * `aria-controls`, so the id cannot be a random one: the page owns it.
     */
    panelId?: string;
    /**
     * `false` when the panel that holds the inspector already names it.
     *
     * The sheet of a narrow screen has its own heading: the inspector must
     * not say the same thing twice.
     */
    showHeading?: boolean;
    /** Called when the user wants to propose a correction of the selection. */
    onsuggest?: (target: CorrectionTarget) => void;
    /** Called when the user wants to relate the selected node to another one. */
    onrelate?: (node: NodeDto) => void;
    /** Called when the API saved a direct edition of the relation. */
    onsaved?: (edge: EdgeDto) => void;
    /**
     * Re-reads the score of a relation after the API counted the vote.
     *
     * The API has no read for the interactions, so the client cannot know
     * whether a vote was counted — the same type is idempotent and does not
     * move the counter again.
     */
    reconcileEdge?: (edgeId: string) => Promise<number | null>;
  }

  let {
    selection,
    nodes = [],
    ledger,
    panelId: givenPanelId,
    showHeading = true,
    onsuggest,
    onrelate,
    onsaved,
    reconcileEdge
  }: Props = $props();

  const api = getApiClient();
  const workspace = getWorkspaceState();
  const locale = getLocaleState();
  const t = locale.t;

  /** The tabs of the inspector, in the order they are shown. */
  type InspectorTab = 'content' | 'attributes' | 'proposals' | 'forum';

  const TABS: readonly { readonly id: InspectorTab; readonly label: TranslationKey }[] = [
    { id: 'content', label: 'inspector.tabContent' },
    { id: 'attributes', label: 'inspector.tabAttributes' },
    { id: 'proposals', label: 'inspector.tabProposals' },
    { id: 'forum', label: 'inspector.tabForum' }
  ];

  /** The tab the user is reading. */
  let activeTab = $state<InspectorTab>('content');

  /** The ids of the tabs and of the panel — they cannot be fixed. */
  const uid = $props.id();
  const panelId = $derived(givenPanelId ?? `inspector-panel-${uid}`);

  /** The id of the tab of a kind. */
  function tabId(tab: InspectorTab): string {
    return `inspector-tab-${tab}-${uid}`;
  }

  /** The selected node — it is already in the view on screen. */
  const selectedNode = $derived(
    selection?.kind === 'node' ? (nodes.find((node) => node.id === selection.id) ?? null) : null
  );

  /** The relation that is selected. */
  let edge = $state.raw<EdgeDto | null>(null);
  let edgeLoading = $state(false);
  let edgeError = $state<ApiFailure | null>(null);

  /**
   * The relation the column shows.
   *
   * The API always answers a relation with its whole shape; a malformed
   * answer is shown as "no relation" rather than as a broken panel.
   */
  const currentEdge = $derived(edge ?? null);

  /** The counter that discards the answer of a superseded read. */
  let edgeRequest = 0;

  /**
   * Reads the selected relation.
   *
   * The subgraph carries the **topology** of a relation only: the
   * attributes, the author pseudonym and the status are in the relation
   * itself, so the inspector reads it.
   */
  $effect(() => {
    const workspaceId = workspace.currentWorkspaceId;
    const id = selection?.kind === 'edge' ? selection.id : null;

    if (id === null) {
      edge = null;
      edgeError = null;
      edgeLoading = false;
      return;
    }

    const current = (edgeRequest += 1);

    edge = null;
    edgeError = null;
    edgeLoading = true;

    void getEdge(api, id)
      .then((found) => {
        if (current !== edgeRequest) {
          return;
        }
        edge = found ?? null;
        edgeLoading = false;
      })      .catch(async (caught: unknown) => {
        if (current !== edgeRequest) {
          return;
        }
        if (await redirectToLoginOnAuthFailure(caught, workspace, page.url.pathname)) {
          edgeLoading = false;
          return;
        }
        edgeError = describeFailure(caught, t);
        edgeLoading = false;
      });
  });

  /**
   * Reads the score of the relation back after a vote.
   *
   * The server is the authority: the score it reports replaces the one the
   * inspector shows.
   */
  async function reconcileRelationScore(edgeId: string): Promise<number | null> {
    if (reconcileEdge === undefined) {
      return null;
    }

    const fresh = await reconcileEdge(edgeId);

    if (fresh !== null && currentEdge !== null && currentEdge.id === edgeId) {
      edge = { ...currentEdge, communityScore: fresh };
    }

    return fresh;
  }

  /** The relation was edited: the inspector adopts the new state. */
  function handleSaved(updated: EdgeDto): void {
    edge = updated;
    onsaved?.(updated);
  }

  /** Shows a tab. */
  function selectTab(tab: InspectorTab): void {
    activeTab = tab;
  }

  /**
   * Moves between the tabs with the keyboard.
   *
   * The tablist is a single stop in the tab order: the arrow keys move
   * from one tab to the next, and the tab they land on is the one that
   * becomes visible.
   */
  function onTabKeydown(event: KeyboardEvent, index: number): void {
    const last = TABS.length - 1;
    let next: number | null = null;

    if (event.key === 'ArrowRight') {
      next = index === last ? 0 : index + 1;
    } else if (event.key === 'ArrowLeft') {
      next = index === 0 ? last : index - 1;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = last;
    }

    if (next === null) {
      return;
    }

    const tab = TABS[next];
    if (tab === undefined) {
      return;
    }

    event.preventDefault();
    activeTab = tab.id;
    document.getElementById(tabId(tab.id))?.focus();
  }
</script>

<aside aria-labelledby={showHeading ? 'inspector-heading' : undefined} class="min-w-0">
  {#if showHeading}
    <h2 id="inspector-heading">
      {t('inspector.heading')}
    </h2>
  {/if}

  <!--
    The panel is **flat**: a white surface on the ground, with no border
    and no shadow at rest. The rule of the tabs is what separates the
    chrome from the content they choose.
  -->
  <div class="mt-2 rounded-card bg-surface p-4">
    <div
      role="tablist"
      aria-label={t('inspector.tabsLabel')}
      class="flex gap-4 border-b border-rule"
    >
      {#each TABS as tab, index (tab.id)}
        <button
          type="button"
          role="tab"
          id={tabId(tab.id)}
          aria-selected={activeTab === tab.id}
          aria-controls={panelId}
          tabindex={activeTab === tab.id ? 0 : -1}
          class="-mb-px border-b-2 border-transparent pb-2 text-body font-medium text-muted hover:text-text aria-[selected=true]:border-accent aria-[selected=true]:text-text"
          onclick={() => selectTab(tab.id)}
          onkeydown={(event) => onTabKeydown(event, index)}
        >
          {t(tab.label)}
        </button>
      {/each}
    </div>

    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={tabId(activeTab)}
      tabindex="0"
      class="mt-3"
    >
      {#if selection === null}
        <p class="text-body text-muted">{t('inspector.emptySelection')}</p>
      {:else if activeTab === 'content'}
        {#if selection.kind === 'edge' && currentEdge === null}
          {@render relationState()}
        {:else}
          <InspectorContent
            node={selectedNode}
            edge={currentEdge}
            {nodes}
            {ledger}
            reconcileEdge={reconcileRelationScore}
            {onrelate}
          />
        {/if}
      {:else if activeTab === 'attributes'}
        {#if selection.kind === 'edge' && currentEdge === null}
          {@render relationState()}
        {:else}
          <InspectorAttributes
            node={selectedNode}
            edge={currentEdge}
            {onsuggest}
            onsaved={handleSaved}
          />
        {/if}
      {:else if activeTab === 'proposals'}
        <InspectorProposals
          targetId={selection.id}
          targetType={selectionTargetType(selection)}
          {ledger}
        />
      {:else}
        <DiscussionPanel
          targetId={selection.id}
          targetType={selectionTargetType(selection)}
          {ledger}
          heading={t('inspector.forumHeading')}
          bare
        />
      {/if}
    </div>
  </div>
</aside>

<!--
  The state of the read of the relation: an explicit message, never a
  blank panel.
-->
{#snippet relationState()}
  {#if edgeError !== null}
    <p role="alert" class="rounded-control bg-pill-negative-bg p-2 text-body text-pill-negative-ink">
      <span class="font-mono">{edgeError.code}</span> — {edgeError.message}
    </p>
  {:else if edgeLoading}
    <p role="status" class="text-body text-muted">{t('inspector.readingRelation')}</p>
  {:else}
    <p role="alert" class="text-body text-pill-negative-ink">{t('inspector.relationUnreadable')}</p>
  {/if}
{/snippet}
