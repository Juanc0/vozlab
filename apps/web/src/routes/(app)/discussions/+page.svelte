<script lang="ts">
  /**
   * The discussions of a target (FR-11, FR-16).
   *
   * A discussion is always about something: the API requires `targetId` and
   * `targetType` on `GET /api/v1/discussions`. The target therefore lives in
   * the query string (`?target=<id>&type=NODE`) — the **workspace** stays
   * out of the URL (FR-04): it is carried by the `X-Workspace-ID` header.
   */
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import { listWorkspaceNodes } from '$lib/api/graph';
  import type { DiscussionTargetType, NodeDto } from '$lib/api/types';
  import { redirectToLoginOnAuthFailure } from '$lib/auth/require-session';
  import DiscussionPanel from '$lib/components/DiscussionPanel.svelte';
  import { VoteLedger } from '$lib/governance/vote.svelte';
  import { getApiClient, getLocaleState, getWorkspaceState } from '$lib/state/context';

  const api = getApiClient();
  const workspace = getWorkspaceState();
  const locale = getLocaleState();
  const t = locale.t;

  /** The session-local state of the votes. */
  const ledger = new VoteLedger();

  /** The kinds of object a discussion may be about. */
  const targetTypeOptions: { value: DiscussionTargetType; label: string }[] = $derived([
    { value: 'NODE', label: t('discussions.targetNode') },
    { value: 'EDGE', label: t('discussions.targetRelation') },
    { value: 'PROPOSAL', label: t('discussions.targetProposal') },
    { value: 'ONTOLOGY', label: t('discussions.targetOntology') }
  ]);

  /** The controls of the picker. */
  let targetTypeInput = $state<DiscussionTargetType>('NODE');
  let targetIdInput = $state('');

  /** The newest nodes of the workspace — the picker of a node target. */
  let nodes = $state.raw<NodeDto[]>([]);
  let nodesError = $state<ApiFailure | null>(null);

  /** The counter that discards the answer of a superseded request. */
  let request = 0;

  /** The last query string the picker was synchronised with. */
  let lastSearch = $state<string | null>(null);

  /** The target of the discussion — it is read from the URL. */
  const targetType = $derived(readTargetType(page.url.searchParams.get('type')));
  const targetId = $derived(page.url.searchParams.get('target') ?? '');

  /**
   * Reads the target type of the URL.
   *
   * An unknown value falls back to `NODE`: the API validates the type, and
   * an invalid one would answer `422` for a request the user never made.
   */
  function readTargetType(value: string | null): DiscussionTargetType {
    const found = targetTypeOptions.find((option) => option.value === value);
    return found?.value ?? 'NODE';
  }

  /**
   * Synchronises the picker with the URL.
   *
   * The URL is the source of truth: the node details panel links here with
   * `?target=<id>&type=NODE`, and the picker must show it.
   */
  $effect(() => {
    const search = page.url.search;
    if (search === lastSearch) {
      return;
    }
    lastSearch = search;
    targetTypeInput = targetType;
    targetIdInput = targetId;
  });

  /** Reads the newest nodes of the workspace — the picker of a node target. */
  $effect(() => {
    const workspaceId = workspace.currentWorkspaceId;

    if (workspaceId === '') {
      return;
    }

    void loadNodes();
  });

  /** Reads the newest nodes of the workspace. */
  async function loadNodes(): Promise<void> {
    const current = (request += 1);
    nodesError = null;

    try {
      const result = await listWorkspaceNodes(api, { limit: 20 });
      if (current !== request) {
        return;
      }
      nodes = result.items;
    } catch (caught) {
      if (current !== request) {
        return;
      }
      if (await redirectToLoginOnAuthFailure(caught, workspace, page.url.pathname)) {
        return;
      }
      nodesError = describeFailure(caught, t);
    }
  }

  /** Shows the discussion of the picked target. */
  function applyTarget(event: SubmitEvent): void {
    event.preventDefault();

    const query = new URLSearchParams({ type: targetTypeInput });
    const id = targetIdInput.trim();
    if (id !== '') {
      query.set('target', id);
    }

    void goto(`/discussions?${query.toString()}`, {
      keepFocus: true,
      noScroll: true,
      replaceState: true
    });
  }

  /** A node of the workspace was picked as the target. */
  function handleNodePicked(event: Event): void {
    const select = event.currentTarget;
    if (!(select instanceof HTMLSelectElement)) {
      return;
    }
    targetTypeInput = 'NODE';
    targetIdInput = select.value;
  }
</script>

<svelte:head>
  <title>{t('discussions.pageTitle')}</title>
</svelte:head>

<section class="mx-auto w-full max-w-6xl space-y-6">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">{t('discussions.heading')}</h1>
    <p class="mt-2 max-w-prose text-ink-muted">
      {t('discussions.intro')}
    </p>
  </div>

  <section aria-labelledby="discussion-target-heading" class="rounded-card border border-line bg-surface p-4">
    <h2 id="discussion-target-heading" class="text-base font-semibold tracking-tight">
      {t('discussions.targetHeading')}
    </h2>

    <form class="mt-3 flex flex-wrap items-end gap-3" onsubmit={applyTarget}>
      <div>
        <label for="target-type" class="block text-xs text-ink-muted">
          {t('discussions.kindLabel')}
        </label>
        <select
          id="target-type"
          class="mt-0.5 rounded-md border border-line-strong bg-surface px-2 py-1 text-sm text-ink"
          bind:value={targetTypeInput}
        >
          {#each targetTypeOptions as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>

      <div class="min-w-0 flex-1">
        <label for="target-id" class="block text-xs text-ink-muted">
          {t('discussions.identifierLabel')}
        </label>
        <input
          id="target-id"
          type="text"
          class="mt-0.5 w-full rounded-md border border-line-strong bg-surface px-2 py-1 font-mono text-sm text-ink"
          placeholder={t('discussions.identifierPlaceholder')}
          bind:value={targetIdInput}
        />
      </div>

      <button
        type="submit"
        class="rounded-md bg-brand-900 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
      >
        {t('discussions.show')}
      </button>
    </form>

    {#if nodesError}
      <p role="alert" class="mt-3 rounded-md border border-negative/30 bg-negative/5 p-3 text-sm text-negative">
        <span class="font-mono">{nodesError.code}</span> — {nodesError.message}
      </p>
    {:else if nodes.length > 0}
      <div class="mt-3">
        <label for="target-node" class="block text-xs text-ink-muted">
          {t('discussions.pickNode')}
        </label>
        <select
          id="target-node"
          class="mt-0.5 w-full rounded-md border border-line-strong bg-surface px-2 py-1 text-sm text-ink"
          value={targetIdInput}
          onchange={handleNodePicked}
        >
          <option value="">{t('discussions.noNodePicked')}</option>
          {#each nodes as node (node.id)}
            <option value={node.id}>{node.title}</option>
          {/each}
        </select>
      </div>
    {/if}
  </section>

  {#if targetId === ''}
    <p class="rounded-card border border-dashed border-line p-6 text-center text-sm text-ink-muted">
      {t('discussions.pickTarget')}
    </p>
  {:else}
    <DiscussionPanel
      targetId={targetId}
      targetType={targetType}
      {ledger}
      heading={t('discussions.threadsHeading')}
    />
  {/if}
</section>
