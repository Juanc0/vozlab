<script lang="ts">
  /**
   * The "Propuestas" tab of the inspector: the proposals whose target is the
   * selected thing, with their delta and the resolution controls.
   *
   * The API's proposal list has **no `targetId` filter** — it takes
   * `status`, `targetType`, `kind`, `limit` and `cursor` — so the proposals
   * of a target are filtered **client-side** over one bounded page, exactly
   * as the node panel of the canvas used to do. When that page was
   * truncated the history is **partial**, and the tab says so: pretending
   * otherwise would be a lie.
   *
   * The resolution controls are the ones of the proposal screen: the API
   * decides who may resolve what, and the client only offers the control
   * to the person who may use it.
   */
  import { page } from '$app/state';
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import { loadTargetProposalHistory } from '$lib/api/proposals';
  import type { ProposalDto, TargetType } from '$lib/api/types';
  import { redirectToLoginOnAuthFailure } from '$lib/auth/require-session';
  import type { VoteLedger } from '$lib/governance/vote.svelte';
  import { getApiClient, getLocaleState, getWorkspaceState } from '$lib/state/context';
  import ProposalDetail from './ProposalDetail.svelte';
  import RichText from './RichText.svelte';

  interface Props {
    /** The id of the target the proposals are about. */
    targetId: string;
    /** The kind of the target (`NODE` or `EDGE`). */
    targetType: TargetType;
    /** The session-local state of the votes. */
    ledger: VoteLedger;
  }

  let { targetId, targetType, ledger }: Props = $props();

  const api = getApiClient();
  const workspace = getWorkspaceState();
  const locale = getLocaleState();
  const t = locale.t;

  /** The proposals of the target. */
  let proposals = $state.raw<ProposalDto[]>([]);
  let loading = $state(false);
  let failure = $state<ApiFailure | null>(null);

  /** `true` when the page the API returned was truncated. */
  let truncated = $state(false);

  /** The counter that discards the answer of a superseded request. */
  let request = 0;

  /**
   * Reads the proposals of the target.
   *
   * The effect reads the workspace and the target and nothing else: the
   * list it fills is never a dependency of the effect.
   */
  $effect(() => {
    const workspaceId = workspace.currentWorkspaceId;
    const id = targetId;
    const type = targetType;

    if (workspaceId === '' || id === '') {
      return;
    }

    const current = (request += 1);

    loading = true;
    failure = null;
    proposals = [];
    truncated = false;

    void loadTargetProposalHistory(api, { targetId: id, targetType: type })
      .then((history) => {
        if (current !== request) {
          return;
        }
        proposals = history.proposals;
        truncated = history.truncated;
        loading = false;
      })
      .catch(async (caught: unknown) => {
        if (current !== request) {
          return;
        }
        if (await redirectToLoginOnAuthFailure(caught, workspace, page.url.pathname)) {
          loading = false;
          return;
        }
        failure = describeFailure(caught, t);
        loading = false;
      });
  });
</script>

<section aria-labelledby="inspector-proposals-heading" class="space-y-3">
  <h3 id="inspector-proposals-heading" class="text-xs font-semibold tracking-wide uppercase">
    {t('inspector.proposalsHeading')}
  </h3>

  {#if failure}
    <p role="alert" class="rounded-md border border-negative/30 bg-negative/5 p-2 text-sm text-negative">
      <span class="font-mono">{failure.code}</span> — {failure.message}
    </p>
  {:else if loading && proposals.length === 0}
    <p role="status" class="text-sm text-ink-muted">{t('inspector.loadingProposals')}</p>
  {:else if proposals.length === 0}
    <p class="text-sm text-ink-muted">{t('inspector.noProposals')}</p>
  {:else}
    <div class="space-y-4">
      {#each proposals as proposal (proposal.id)}
        <div class="rounded-md border border-line bg-surface-muted/40 p-3">
          <ProposalDetail {proposal} {ledger} discussion={false} />
        </div>
      {/each}
    </div>
  {/if}

  {#if truncated}
    <p class="text-xs text-warning">
      <RichText text={t('inspector.proposalsPartial')} />
    </p>
  {/if}
</section>
