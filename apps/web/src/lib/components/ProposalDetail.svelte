<script lang="ts">
  /**
   * The review of one proposal (FR-12, FR-13).
   *
   * The panel shows the delta, the discussion and the resolution controls.
   * The controls are **hints**: the API re-checks every action, so a `403`
   * or a `422` is shown with its own code and message instead of being
   * swallowed.
   */
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import {
    resolveMergeTargetLabel,
    resolveProposalTarget,
    type ProposalTarget
  } from '$lib/api/proposal-target';
  import {
    autoApplyProposal,
    approveProposal,
    getProposal,
    rejectProposal,
    type ResolvedProposal
  } from '$lib/api/proposals';
  import type { ProposalDto } from '$lib/api/types';
  import { readMergeTarget } from '$lib/governance/delta';
  import {
    AUTO_APPLY_MIN_AGE_DAYS,
    AUTO_APPLY_MIN_SCORE,
    proposalAgeDays,
    proposalPermissions
  } from '$lib/governance/permissions';
  import type { VoteLedger } from '$lib/governance/vote.svelte';
  import { formatDate, formatNumber } from '$lib/i18n';
  import { getApiClient, getLocaleState, getSessionState, getWorkspaceState } from '$lib/state/context';
  import DiscussionPanel from './DiscussionPanel.svelte';
  import ProposalDelta from './ProposalDelta.svelte';
  import VoteButtons from './VoteButtons.svelte';

  interface Props {
    /** The proposal under review. */
    proposal: ProposalDto;
    /** The session-local state of the votes. */
    ledger: VoteLedger;
    /** Called when the API resolved the proposal (its status changed). */
    onresolved?: (resolved: ResolvedProposal) => void;
    /** Called when the API answered with a fresh score of the proposal. */
    onscored?: (proposalId: string, communityScore: number) => void;
    /**
     * `false` leaves the discussion of the proposal out.
     *
     * The inspector shows the forum of the **target** in its own tab: the
     * discussion of every proposal would be a second forum inside the
     * column, and the reader would not know which one answers what.
     */
    discussion?: boolean;
  }

  let { proposal, ledger, onresolved, onscored, discussion = true }: Props = $props();

  const api = getApiClient();
  const session = getSessionState();
  const workspace = getWorkspaceState();
  const locale = getLocaleState();
  const t = locale.t;

  /**
   * The ids of the sections.
   *
   * The proposal may be rendered more than once on a page — the inspector
   * shows every proposal of the target — so the ids cannot be fixed.
   */
  const uid = $props.id();
  const headingId = `proposal-heading-${uid}`;
  const deltaHeadingId = `proposal-delta-heading-${uid}`;
  const voteHeadingId = `proposal-vote-heading-${uid}`;
  const resolutionHeadingId = `proposal-resolution-heading-${uid}`;

  /** The target of the proposal — its maintainer and a readable label. */
  let target = $state<ProposalTarget | null>(null);

  /** The title of the node that survives a merge. */
  let mergeLabel = $state<string | null>(null);

  /** The resolution in flight. */
  let resolving = $state(false);

  /** The outcome of the last resolution. */
  let actionError = $state<ApiFailure | null>(null);
  let notice = $state<string | null>(null);

  /** The counters that discard the answer of a superseded read. */
  let targetRequest = 0;
  let mergeRequest = 0;

  /**
   * The proposal whose target was read last.
   *
   * The owner replaces the proposal object when its status or its score
   * changes; the target of a proposal does not change with it. The reads are
   * therefore done once per proposal — the controls must not flash while a
   * vote is confirmed.
   */
  let targetReadFor = '';
  let mergeReadFor = '';

  /**
   * Reads the target of the proposal.
   *
   * The target decides **who may resolve the proposal**: the API compares
   * the caller with the author of the target, not with the author of the
   * proposal. The read is asynchronous, so the controls wait for it — they
   * must not flash for the wrong user.
   */
  $effect(() => {
    const id = proposal.id;

    if (id === targetReadFor) {
      return;
    }
    targetReadFor = id;

    const current = (targetRequest += 1);

    target = null;

    void resolveProposalTarget(api, proposal).then((resolved) => {
      if (current !== targetRequest) {
        return;
      }
      target = resolved;
    });
  });

  /**
   * Reads the node that survives a merge (ADR-0026).
   *
   * The payload is narrowed first: a malformed one names no node, and the
   * view says so instead of asking the API about a uuid that does not
   * exist.
   */
  $effect(() => {
    const merge = proposal.kind === 'MERGE' ? readMergeTarget(proposal.proposedChanges) : null;
    const nodeId = merge?.kind === 'node' ? merge.mergeIntoNodeId : null;

    if (nodeId === null || nodeId === mergeReadFor) {
      return;
    }
    mergeReadFor = nodeId;

    const current = (mergeRequest += 1);

    mergeLabel = null;

    void resolveMergeTargetLabel(api, nodeId).then((label) => {
      if (current !== mergeRequest) {
        return;
      }
      mergeLabel = label;
    });
  });

  /** The permissions of the signed-in user over this proposal. */
  const permissions = $derived(
    target === null
      ? null
      : proposalPermissions({
          proposal,
          authorHash: session.user?.authorHash ?? null,
          isModerator: workspace.isModerator,
          targetMaintainerHash: target.known ? target.maintainerHash : null
        })
  );

  /** The age of the proposal, in days. */
  const ageDays = $derived(Math.floor(proposalAgeDays(proposal)));

  /**
   * The reason why the auto-apply is not available.
   *
   * The reason is a piece of copy: it is read from the dictionary and put
   * into the sentence that explains the refusal.
   */
  function autoApplyBlockerReason(): string {
    const blocker = permissions?.autoApplyBlocker;

    if (blocker === 'score') {
      return t('proposals.autoApplyBlockedScore', { score: AUTO_APPLY_MIN_SCORE });
    }
    if (blocker === 'age') {
      return t('proposals.autoApplyBlockedAge', { days: AUTO_APPLY_MIN_AGE_DAYS });
    }
    if (blocker === 'role') {
      return t('proposals.autoApplyBlockedRole');
    }
    return t('proposals.autoApplyBlockedClosed');
  }

  /**
   * Reads the score of the proposal back after a vote.
   *
   * The API has no read for the interactions: a vote of the **same** type is
   * idempotent and does not move the counter again. The score of the
   * proposal is therefore read back and adopted — the server is the
   * authority.
   */
  async function reconcileScore(): Promise<number | null> {
    try {
      const fresh = await getProposal(api, proposal.id);
      onscored?.(proposal.id, fresh.communityScore);
      return fresh.communityScore;
    } catch {
      return null;
    }
  }

  /** Resolves the proposal and reports the outcome. */
  async function resolve(action: 'approve' | 'reject' | 'auto-apply'): Promise<void> {
    resolving = true;
    actionError = null;
    notice = null;

    try {
      const resolved =
        action === 'approve'
          ? await approveProposal(api, proposal.id)
          : action === 'reject'
            ? await rejectProposal(api, proposal.id)
            : await autoApplyProposal(api, proposal.id);

      notice = t('proposals.nowStatus', { status: resolved.status });
      onresolved?.(resolved);
    } catch (caught) {
      actionError = describeFailure(caught, t);
    } finally {
      resolving = false;
    }
  }
</script>

<article aria-labelledby={headingId} class="space-y-4">
  <header>
    <div class="flex flex-wrap items-center gap-2">
      <h2 id={headingId} class="text-base font-semibold tracking-tight">
        {proposal.kind === 'MERGE' ? t('proposals.mergeProposal') : t('proposals.editProposal')}
      </h2>
      <span class="rounded bg-surface-muted px-1.5 py-0.5 text-xs text-ink-muted">
        {proposal.status}
      </span>
    </div>

    <dl class="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
      <dt class="text-ink-muted">{t('proposals.target')}</dt>
      <dd>
        {proposal.targetType}
        {#if target?.label}
          <span class="text-ink-muted">— {target.label}</span>
        {/if}
        <span class="block font-mono text-xs break-all text-ink-muted">{proposal.targetId}</span>
      </dd>

      <dt class="text-ink-muted">{t('proposals.author')}</dt>
      <dd class="font-mono text-xs break-all">{proposal.proposerHash}</dd>

      <dt class="text-ink-muted">{t('proposals.created')}</dt>
      <dd>
        <time datetime={proposal.createdAt}>
          {formatDate(locale.locale, proposal.createdAt)}
        </time>
        <span class="text-ink-muted">
          ({t('proposals.daysAgo', { count: formatNumber(locale.locale, ageDays) })})
        </span>
      </dd>

      {#if proposal.resolvedAt}
        <dt class="text-ink-muted">{t('proposals.resolved')}</dt>
        <dd>
          <time datetime={proposal.resolvedAt}>
            {formatDate(locale.locale, proposal.resolvedAt)}
          </time>
          {#if proposal.resolvedBy}
            <span class="block font-mono text-xs break-all text-ink-muted">{proposal.resolvedBy}</span>
          {/if}
        </dd>
      {/if}
    </dl>

    {#if proposal.justification}
      <p class="mt-2 text-sm">{proposal.justification}</p>
    {/if}
  </header>

  <section aria-labelledby={deltaHeadingId}>
    <h3 id={deltaHeadingId} class="text-xs font-semibold tracking-wide uppercase">
      {t('proposals.proposedChange')}
    </h3>
    <div class="mt-1">
      <ProposalDelta {proposal} mergeTargetLabel={mergeLabel} />
    </div>
  </section>

  <section aria-labelledby={voteHeadingId}>
    <h3 id={voteHeadingId} class="text-xs font-semibold tracking-wide uppercase">
      {t('proposals.voteHeading')}
    </h3>
    <div class="mt-1">
      <VoteButtons
        {ledger}
        targetId={proposal.id}
        targetType="PROPOSAL"
        score={proposal.communityScore}
        label={t('vote.thisProposal')}
        reconcile={reconcileScore}
      />
    </div>
  </section>

  <section aria-labelledby={resolutionHeadingId}>
    <h3 id={resolutionHeadingId} class="text-xs font-semibold tracking-wide uppercase">
      {t('proposals.resolutionHeading')}
    </h3>

    {#if notice}
      <p role="status" class="mt-1 rounded-md border border-line bg-surface-muted p-2 text-sm">
        {notice}
      </p>
    {/if}

    {#if actionError}
      <p role="alert" class="mt-1 rounded-md border border-negative/30 bg-negative/5 p-2 text-sm text-negative">
        <span class="font-mono">{actionError.code}</span> — {actionError.message}
      </p>
    {/if}

    {#if permissions === null}
      <p role="status" class="mt-1 text-sm text-ink-muted">{t('proposals.readingTarget')}</p>
    {:else if proposal.status !== 'PENDING'}
      <p class="mt-1 text-sm text-ink-muted">
        {t('proposals.notOpen', { status: proposal.status })}
      </p>
    {:else}
      <div class="mt-1 flex flex-wrap items-center gap-2">
        {#if permissions.canResolve}
          <button
            type="button"
            class="rounded-md bg-brand-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={resolving}
            onclick={() => void resolve('approve')}
          >
            {t('proposals.approve')}
          </button>
          <button
            type="button"
            class="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
            disabled={resolving}
            onclick={() => void resolve('reject')}
          >
            {t('proposals.reject')}
          </button>
        {/if}

        {#if permissions.canAutoApply}
          <button
            type="button"
            class="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
            disabled={resolving}
            onclick={() => void resolve('auto-apply')}
          >
            {t('proposals.autoApply')}
          </button>
        {/if}
      </div>

      {#if !permissions.canResolve}
        <p class="mt-1 text-sm text-ink-muted">
          {t('proposals.belongsToMaintainer')}
        </p>
      {/if}

      {#if !permissions.canAutoApply}
        <p class="mt-1 text-sm text-ink-muted">
          {t('proposals.autoApplyBlocked', { reason: autoApplyBlockerReason() })}
        </p>
      {/if}
    {/if}
  </section>

  {#if discussion}
    <DiscussionPanel
      targetId={proposal.id}
      targetType="PROPOSAL"
      {ledger}
      heading={t('proposals.discussionHeading')}
    />
  {/if}
</article>
