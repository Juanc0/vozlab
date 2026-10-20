<script lang="ts">
  /**
   * The proposals of the workspace (FR-10 … FR-13).
   *
   * The list is filtered by the API itself (`status`, `targetType`, `kind`)
   * and paged with the opaque keyset cursor: the next page is read with the
   * `nextCursor` of the current one.
   *
   * The URL stays clean: the workspace is **not** a path segment — it is
   * carried by the `X-Workspace-ID` header (FR-04).
   */
  import { page } from '$app/state';
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import { listProposals, type ProposalFilters, type ResolvedProposal } from '$lib/api/proposals';
  import type { ProposalDto, ProposalKind, ProposalStatus, TargetType } from '$lib/api/types';
  import { redirectToLoginOnAuthFailure } from '$lib/auth/require-session';
  import ProposalDetail from '$lib/components/ProposalDetail.svelte';
  import { VoteLedger } from '$lib/governance/vote.svelte';
  import { getApiClient, getWorkspaceState } from '$lib/state/context';

  const api = getApiClient();
  const workspace = getWorkspaceState();

  /** The session-local state of the votes. */
  const ledger = new VoteLedger();

  /** The filters of the list — every one of them is optional. */
  let filters = $state<ProposalFilters>({ status: null, targetType: null, kind: null });

  /** The proposals of the workspace. */
  let proposals = $state.raw<ProposalDto[]>([]);
  let cursor = $state<string | null>(null);
  let loading = $state(false);
  let listError = $state<ApiFailure | null>(null);

  /** The proposal under review. */
  let selectedId = $state<string | null>(null);

  /** The counter that discards the answer of a superseded request. */
  let request = 0;

  /** The statuses the API accepts (`ListProposalQuerySchema`). */
  const statusOptions: { value: ProposalStatus; label: string }[] = [
    { value: 'PENDING', label: 'Pending' },
    { value: 'APPROVED_BY_AUTHOR', label: 'Approved by the author' },
    { value: 'REJECTED_BY_AUTHOR', label: 'Rejected by the author' },
    { value: 'AUTO_APPLIED', label: 'Auto-applied' }
  ];

  /** The kinds of target the API accepts. */
  const targetTypeOptions: { value: TargetType; label: string }[] = [
    { value: 'NODE', label: 'Node' },
    { value: 'EDGE', label: 'Relation' },
    { value: 'ONTOLOGY', label: 'Ontology class' }
  ];

  /** The kinds of proposal (ADR-0026). */
  const kindOptions: { value: ProposalKind; label: string }[] = [
    { value: 'EDIT', label: 'Edit' },
    { value: 'MERGE', label: 'Merge' }
  ];

  /** The proposal under review. */
  const selected = $derived(proposals.find((proposal) => proposal.id === selectedId) ?? null);

  /**
   * Reads the proposals of the workspace.
   *
   * The effect reads the workspace and nothing else: a change of the
   * filters is an explicit action of the user, not a reaction.
   */
  $effect(() => {
    const workspaceId = workspace.currentWorkspaceId;

    if (workspaceId === '') {
      return;
    }

    void loadProposals(null);
  });

  /** Reads one page of the proposals. */
  async function loadProposals(nextCursor: string | null): Promise<void> {
    const current = (request += 1);
    loading = true;
    listError = null;

    try {
      const result = await listProposals(api, { filters, cursor: nextCursor });
      if (current !== request) {
        return;
      }

      proposals = nextCursor === null ? result.items : [...proposals, ...result.items];
      cursor = result.nextCursor;

      // The server's score is the source of truth of every proposal.
      for (const proposal of result.items) {
        ledger.sync(proposal.id, proposal.communityScore);
      }
    } catch (caught) {
      if (current !== request) {
        return;
      }
      if (await redirectToLoginOnAuthFailure(caught, workspace, page.url.pathname)) {
        return;
      }
      listError = describeFailure(caught);
    } finally {
      if (current === request) {
        loading = false;
      }
    }
  }

  /** Applies a filter and reads the first page again. */
  function applyFilters(): void {
    selectedId = null;
    void loadProposals(null);
  }

  /** Reads the value of a filter control. */
  function filterValue(event: Event): string {
    const select = event.currentTarget;
    return select instanceof HTMLSelectElement ? select.value : '';
  }

  /** The status filter changed. */
  function handleStatusChange(event: Event): void {
    filters = { ...filters, status: (filterValue(event) || null) as ProposalStatus | null };
    applyFilters();
  }

  /** The target-type filter changed. */
  function handleTargetTypeChange(event: Event): void {
    filters = { ...filters, targetType: (filterValue(event) || null) as TargetType | null };
    applyFilters();
  }

  /** The kind filter changed. */
  function handleKindChange(event: Event): void {
    filters = { ...filters, kind: (filterValue(event) || null) as ProposalKind | null };
    applyFilters();
  }

  /** The API resolved the proposal: its status changed. */
  function handleResolved(resolved: ResolvedProposal): void {
    proposals = proposals.map((proposal) =>
      proposal.id === resolved.id ? { ...proposal, status: resolved.status } : proposal
    );
  }

  /** The API answered with a fresh score of a proposal (after a vote). */
  function handleScored(proposalId: string, communityScore: number): void {
    proposals = proposals.map((proposal) =>
      proposal.id === proposalId ? { ...proposal, communityScore } : proposal
    );
  }

  /** A readable instant. */
  function formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
  }
</script>

<section class="space-y-6">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">Proposals</h1>
    <p class="mt-2 max-w-prose text-ink-muted">
      The knowledge pull requests of the workspace: open one to see the proposed change, to
      discuss it and to vote on it. The active workspace is carried by a request header, not by the
      URL: the path stays <code>/proposals</code>.
    </p>
  </div>

  <section
    aria-labelledby="proposal-filters-heading"
    class="rounded-card border border-line bg-surface p-4"
  >
    <h2 id="proposal-filters-heading" class="text-base font-semibold tracking-tight">Filters</h2>

    <div class="mt-3 flex flex-wrap items-end gap-3 text-sm">
      <div>
        <label for="filter-status" class="block text-xs text-ink-muted">Status</label>
        <select
          id="filter-status"
          class="mt-0.5 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
          value={filters.status ?? ''}
          onchange={handleStatusChange}
        >
          <option value="">All</option>
          {#each statusOptions as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>

      <div>
        <label for="filter-target-type" class="block text-xs text-ink-muted">Target</label>
        <select
          id="filter-target-type"
          class="mt-0.5 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
          value={filters.targetType ?? ''}
          onchange={handleTargetTypeChange}
        >
          <option value="">All</option>
          {#each targetTypeOptions as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>

      <div>
        <label for="filter-kind" class="block text-xs text-ink-muted">Kind</label>
        <select
          id="filter-kind"
          class="mt-0.5 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
          value={filters.kind ?? ''}
          onchange={handleKindChange}
        >
          <option value="">All</option>
          {#each kindOptions as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>
    </div>
  </section>

  <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
    <section aria-labelledby="proposal-list-heading" class="min-w-0">
      <h2 id="proposal-list-heading" class="sr-only">The proposals of the workspace</h2>

      {#if listError}
        <p role="alert" class="rounded-md border border-negative/30 bg-negative/5 p-3 text-sm text-negative">
          <span class="font-mono">{listError.code}</span> — {listError.message}
        </p>
      {:else if loading && proposals.length === 0}
        <p role="status" class="text-sm text-ink-muted">Loading the proposals…</p>
      {:else if proposals.length === 0}
        <p class="rounded-card border border-dashed border-line p-6 text-center text-sm text-ink-muted">
          No proposal matches these filters in this workspace.
        </p>
      {:else}
        <ul class="divide-y divide-line">
          {#each proposals as proposal (proposal.id)}
            <li class="py-2">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <button
                  type="button"
                  class="rounded text-left font-medium text-brand-900 underline decoration-brand-300 underline-offset-2 hover:decoration-brand-700 aria-[current=true]:font-semibold"
                  aria-current={selectedId === proposal.id ? 'true' : undefined}
                  onclick={() => (selectedId = proposal.id)}
                >
                  {proposal.kind === 'MERGE' ? 'Merge proposal' : 'Edit proposal'}
                  {proposal.targetType.toLowerCase()}
                </button>
                <span class="text-xs text-ink-muted">
                  {proposal.status} · score {proposal.communityScore} · {formatDate(proposal.createdAt)}
                </span>
              </div>

              {#if proposal.justification}
                <p class="mt-1 text-sm text-ink-muted">{proposal.justification}</p>
              {/if}
            </li>
          {/each}
        </ul>

        {#if cursor !== null}
          <button
            type="button"
            class="mt-3 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
            onclick={() => void loadProposals(cursor)}
          >
            {loading ? 'Loading…' : 'Show older proposals'}
          </button>
        {/if}
      {/if}
    </section>

    <aside aria-labelledby="proposal-detail-heading" class="min-w-0">
      <section class="rounded-card border border-line bg-surface p-4">
        <h2 id="proposal-detail-heading" class="sr-only">The proposal under review</h2>

        {#if selected === null}
          <p class="text-sm text-ink-muted">
            Pick a proposal in the list to see its proposed change, its discussion and the controls
            of its resolution.
          </p>
        {:else}
          <ProposalDetail
            proposal={selected}
            {ledger}
            onresolved={handleResolved}
            onscored={handleScored}
          />
        {/if}
      </section>
    </aside>
  </div>
</section>
