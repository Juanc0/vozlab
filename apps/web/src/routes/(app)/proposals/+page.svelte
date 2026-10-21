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
  import {
    getProposal,
    listProposals,
    type ProposalFilters,
    type ResolvedProposal
  } from '$lib/api/proposals';
  import type { ProposalDto, ProposalKind, ProposalStatus, TargetType } from '$lib/api/types';
  import { redirectToLoginOnAuthFailure } from '$lib/auth/require-session';
  import ProposalDetail from '$lib/components/ProposalDetail.svelte';
  import { VoteLedger } from '$lib/governance/vote.svelte';
  import { formatDate, formatNumber } from '$lib/i18n';
  import { getApiClient, getLocaleState, getWorkspaceState } from '$lib/state/context';
  import RichText from '$lib/components/RichText.svelte';

  const api = getApiClient();
  const workspace = getWorkspaceState();
  const locale = getLocaleState();
  const t = locale.t;

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

  /**
   * The proposal the URL names, read back.
   *
   * The list is filtered by the API and paged: the proposal of a link may
   * not be in the page that is loaded (it may be filtered out). It is then
   * read by its id — the link must never lead to an empty panel.
   */
  let focused = $state.raw<ProposalDto | null>(null);
  let focusError = $state<ApiFailure | null>(null);

  /** The counter that discards the answer of a superseded request. */
  let request = 0;

  /** The counter that discards the answer of a superseded read. */
  let focusRequest = 0;

  /** The statuses the API accepts (`ListProposalQuerySchema`). */
  const statusOptions: { value: ProposalStatus; label: string }[] = $derived([
    { value: 'PENDING', label: t('proposals.statusPending') },
    { value: 'APPROVED_BY_AUTHOR', label: t('proposals.statusApproved') },
    { value: 'REJECTED_BY_AUTHOR', label: t('proposals.statusRejected') },
    { value: 'AUTO_APPLIED', label: t('proposals.statusAutoApplied') }
  ]);

  /** The kinds of target the API accepts. */
  const targetTypeOptions: { value: TargetType; label: string }[] = $derived([
    { value: 'NODE', label: t('proposals.targetNode') },
    { value: 'EDGE', label: t('proposals.targetRelation') },
    { value: 'ONTOLOGY', label: t('proposals.targetOntology') }
  ]);

  /** The kinds of proposal (ADR-0026). */
  const kindOptions: { value: ProposalKind; label: string }[] = $derived([
    { value: 'EDIT', label: t('proposals.kindEdit') },
    { value: 'MERGE', label: t('proposals.kindMerge') }
  ]);

  /**
   * The name of the kind of a target, as the list of the proposals reads.
   *
   * The value of the API is a contract identifier; the name the user reads
   * is the copy of the dictionary.
   */
  function targetNoun(targetType: string): string {
    switch (targetType) {
      case 'NODE':
        return t('proposals.nounNode');
      case 'EDGE':
        return t('proposals.nounRelation');
      case 'ONTOLOGY':
        return t('proposals.nounOntology');
      default:
        return targetType;
    }
  }

  /** The proposal under review. */
  const selected = $derived(
    proposals.find((proposal) => proposal.id === selectedId) ??
      (focused !== null && focused.id === selectedId ? focused : null)
  );

  /**
   * The proposal the URL names is the one under review.
   *
   * The workspace is **not** a path segment (FR-04), but the proposal is
   * named in the query string: the link of a created proposal opens it.
   */
  $effect(() => {
    const id = page.url.searchParams.get('proposal');

    if (id === null || id === '') {
      return;
    }

    selectedId = id;
  });

  /**
   * Reads the proposal under review back when the list does not hold it.
   *
   * The list is filtered and paged by the API: the proposal of a link may
   * be outside the page that is loaded.
   */
  $effect(() => {
    const id = selectedId;

    if (id === null) {
      return;
    }

    if (proposals.some((proposal) => proposal.id === id)) {
      focused = null;
      focusError = null;
      return;
    }

    const current = (focusRequest += 1);

    void getProposal(api, id)
      .then((proposal) => {
        if (current !== focusRequest) {
          return;
        }
        focused = proposal;
        focusError = null;
      })
      .catch((caught: unknown) => {
        if (current !== focusRequest) {
          return;
        }
        focused = null;
        focusError = describeFailure(caught, t);
      });
  });

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
      listError = describeFailure(caught, t);
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
</script>

<svelte:head>
  <title>{t('proposals.pageTitle')}</title>
</svelte:head>

<section class="mx-auto w-full max-w-6xl space-y-6">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">{t('proposals.heading')}</h1>
    <p class="mt-2 max-w-prose text-ink-muted">
      <RichText text={t('proposals.intro')} />
    </p>
  </div>

  <section
    aria-labelledby="proposal-filters-heading"
    class="rounded-card border border-line bg-surface p-4"
  >
    <h2 id="proposal-filters-heading" class="text-base font-semibold tracking-tight">
      {t('proposals.filtersHeading')}
    </h2>

    <div class="mt-3 flex flex-wrap items-end gap-3 text-sm">
      <div>
        <label for="filter-status" class="block text-xs text-ink-muted">
          {t('proposals.filterStatus')}
        </label>
        <select
          id="filter-status"
          class="mt-0.5 rounded-md border border-line-strong bg-surface px-2 py-1 text-sm text-ink"
          value={filters.status ?? ''}
          onchange={handleStatusChange}
        >
          <option value="">{t('common.all')}</option>
          {#each statusOptions as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>

      <div>
        <label for="filter-target-type" class="block text-xs text-ink-muted">
          {t('proposals.filterTarget')}
        </label>
        <select
          id="filter-target-type"
          class="mt-0.5 rounded-md border border-line-strong bg-surface px-2 py-1 text-sm text-ink"
          value={filters.targetType ?? ''}
          onchange={handleTargetTypeChange}
        >
          <option value="">{t('common.all')}</option>
          {#each targetTypeOptions as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>

      <div>
        <label for="filter-kind" class="block text-xs text-ink-muted">
          {t('proposals.filterKind')}
        </label>
        <select
          id="filter-kind"
          class="mt-0.5 rounded-md border border-line-strong bg-surface px-2 py-1 text-sm text-ink"
          value={filters.kind ?? ''}
          onchange={handleKindChange}
        >
          <option value="">{t('common.all')}</option>
          {#each kindOptions as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>
    </div>
  </section>

  <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
    <section aria-labelledby="proposal-list-heading" class="min-w-0">
      <h2 id="proposal-list-heading" class="sr-only">{t('proposals.listHeading')}</h2>

      {#if listError}
        <p role="alert" class="rounded-md border border-negative/30 bg-negative/5 p-3 text-sm text-negative">
          <span class="font-mono">{listError.code}</span> — {listError.message}
        </p>
      {:else if loading && proposals.length === 0}
        <p role="status" class="text-sm text-ink-muted">{t('proposals.loading')}</p>
      {:else if proposals.length === 0}
        <p class="rounded-card border border-dashed border-line p-6 text-center text-sm text-ink-muted">
          {t('proposals.none')}
        </p>
      {:else}
        <!--
          The list is a real table: a proposal is a row, and the row is
          identified by its own cell (the row header). The scroll container
          is a focusable region so that a keyboard user can reach the
          columns that do not fit (WCAG 2.2 SC 2.1.1).
        -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          class="overflow-x-auto rounded-card border border-line"
          role="region"
          aria-label={t('proposals.listRegion')}
          tabindex="0"
        >
          <table class="w-full border-collapse text-left text-sm">
            <caption class="sr-only">
              {t('proposals.listCaption')}
            </caption>
            <thead class="bg-surface-muted text-xs tracking-wide text-ink-muted uppercase">
              <tr>
                <th scope="col" class="px-3 py-2 font-semibold">{t('proposals.columnProposal')}</th>
                <th scope="col" class="px-3 py-2 font-semibold">{t('proposals.columnStatus')}</th>
                <th scope="col" class="px-3 py-2 font-semibold">{t('proposals.columnScore')}</th>
                <th scope="col" class="px-3 py-2 font-semibold">{t('proposals.columnCreated')}</th>
              </tr>
            </thead>
            <tbody>
              {#each proposals as proposal (proposal.id)}
                <tr class="border-t border-line align-top">
                  <th scope="row" class="px-3 py-2 font-normal">
                    <button
                      type="button"
                      class="rounded text-left font-medium text-brand-900 underline decoration-brand-300 underline-offset-2 hover:decoration-brand-700 aria-[current=true]:font-semibold"
                      aria-current={selectedId === proposal.id ? 'true' : undefined}
                      onclick={() => (selectedId = proposal.id)}
                    >
                      {proposal.kind === 'MERGE'
                        ? t('proposals.mergeProposalOf', { target: targetNoun(proposal.targetType) })
                        : t('proposals.editProposalOf', { target: targetNoun(proposal.targetType) })}
                    </button>
                    {#if proposal.justification}
                      <span class="mt-1 block text-sm font-normal text-ink-muted">
                        {proposal.justification}
                      </span>
                    {/if}
                  </th>
                  <td class="px-3 py-2 text-ink-muted">{proposal.status}</td>
                  <td class="px-3 py-2 tabular-nums text-ink-muted">
                    {formatNumber(locale.locale, proposal.communityScore)}
                  </td>
                  <td class="px-3 py-2 text-ink-muted">
                    <time datetime={proposal.createdAt}>
                      {formatDate(locale.locale, proposal.createdAt)}
                    </time>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        {#if cursor !== null}
          <button
            type="button"
            class="mt-3 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
            onclick={() => void loadProposals(cursor)}
          >
            {loading ? t('common.loading') : t('proposals.showOlder')}
          </button>
        {/if}
      {/if}
    </section>

    <aside aria-labelledby="proposal-detail-heading" class="min-w-0">
      <section class="rounded-card border border-line bg-surface p-4">
        <h2 id="proposal-detail-heading" class="sr-only">{t('proposals.detailHeading')}</h2>

        {#if focusError}
          <p role="alert" class="rounded-md border border-negative/30 bg-negative/5 p-3 text-sm text-negative">
            <span class="font-mono">{focusError.code}</span> — {focusError.message}
          </p>
        {:else if selected === null}
          <p class="text-sm text-ink-muted">
            {t('proposals.pickProposal')}
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
