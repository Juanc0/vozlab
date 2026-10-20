<script lang="ts">
  /**
   * The optimistic vote (FR-14, FR-15).
   *
   * The score moves **before** the request goes out; a refusal rolls it
   * back to the exact value it had and says why. The server stays the
   * authority: it enforces one vote per user and target, and its refusal
   * (`409 ERR_DUPLICATE_INTERACTION`) is shown, never swallowed.
   *
   * The state of the vote lives in the {@link VoteLedger} of the page: the
   * API has no read for the interactions, so the session is the only place
   * that knows which vote was cast.
   *
   * **Offline, the vote is refused before the optimistic update.** A request
   * that never left the app must not move the score, and there is nothing to
   * roll back: it was never optimistic.
   */
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import { castVote } from '$lib/api/interactions';
  import { OfflineError } from '$lib/api/errors';
  import type { InteractionTargetType, InteractionType } from '$lib/api/types';
  import type { VoteLedger } from '$lib/governance/vote.svelte';
  import { formatNumber } from '$lib/i18n';
  import { connectivityState } from '$lib/pwa/connectivity.svelte';
  import { getApiClient, getLocaleState } from '$lib/state/context';

  interface Props {
    /** The session-local state of the votes. */
    ledger: VoteLedger;
    /** The id of the voted target. */
    targetId: string;
    /** The kind of the voted target. */
    targetType: InteractionTargetType;
    /** The score the server reported for the target. */
    score: number;
    /** What the target is, for the accessible names ("this proposal"). */
    label?: string;
    /**
     * Re-reads the score of the target after the API counted the vote.
     *
     * The API has no read for the interactions, so the client cannot know
     * whether a vote was counted — the **same** type is idempotent and does
     * not move the counter again. The owner of the target reads its score
     * back and the ledger adopts it: the server stays the authority.
     */
    reconcile?: () => Promise<number | null>;
  }

  let { ledger, targetId, targetType, score, label, reconcile }: Props = $props();

  const api = getApiClient();
  const locale = getLocaleState();
  const t = locale.t;

  /** The name of the target, for the accessible names of the buttons. */
  const target = $derived(label ?? t('vote.thisItem'));

  let pending = $state(false);
  let info = $state<string | null>(null);
  let failure = $state<ApiFailure | null>(null);

  /** The score shown: the server's score plus the votes in flight. */
  const displayed = $derived(ledger.score(targetId, score));

  /** The score, written with the conventions of the locale. */
  const formatted = $derived(formatNumber(locale.locale, displayed));

  /** The interaction the user already cast for this target, if any. */
  const voted = $derived(ledger.votedType(targetId));

  /**
   * Casts a vote.
   *
   * The optimistic update happens first, so the user sees the result of the
   * click immediately. A refusal rolls the score back to the value it had
   * before the click and shows the API's own code and message.
   */
  async function vote(interactionType: InteractionType): Promise<void> {
    if (pending) {
      return;
    }

    pending = true;
    info = null;
    failure = null;

    // The offline mode is read-only: the vote is refused **before** the
    // optimistic update, so the score does not move at all. The rollback
    // does not run either — there is nothing to roll back.
    if (connectivityState.offline) {
      failure = describeFailure(new OfflineError(), t);
      pending = false;
      return;
    }

    // A repeat of the type the user already cast is idempotent on the
    // server: it answers `201` but does not move the counter again. The
    // ledger knows the type, so it knows the difference.
    const wasRepeat = ledger.votedType(targetId) === interactionType;
    const optimistic = ledger.applyOptimistic(targetId, score, interactionType);

    try {
      await castVote(api, { targetId, targetType, interactionType });
      ledger.confirm(targetId, optimistic, { counted: !wasRepeat });
      announce(wasRepeat);

      if (reconcile !== undefined) {
        await reconcileScore(wasRepeat);
      }
    } catch (caught) {
      ledger.rollback(targetId, optimistic);
      failure = describeFailure(caught, t);
    } finally {
      pending = false;
    }
  }

  /** Announces the outcome of the vote to the screen readers. */
  function announce(wasRepeat: boolean): void {
    info = wasRepeat
      ? t('vote.alreadyCounted')
      : t('vote.recorded', { score: formatNumber(locale.locale, ledger.score(targetId, score)) });
  }

  /**
   * Reads the score of the target back and adopts it.
   *
   * A failed read is not a failed vote: the vote is already counted, so the
   * optimistic value stays and nothing is rolled back.
   */
  async function reconcileScore(wasRepeat: boolean): Promise<void> {
    if (reconcile === undefined) {
      return;
    }

    try {
      const fresh = await reconcile();
      if (fresh === null) {
        return;
      }
      ledger.sync(targetId, fresh);
      announce(wasRepeat);
    } catch {
      // The read failed: the optimistic value is kept.
    }
  }
</script>

<!--
  The two buttons are a group: the name tells the screen reader what the
  group votes on, and the score is read next to its own label.
-->
<div class="inline-flex items-center gap-1.5" role="group" aria-label={t('vote.onLabel', { label: target })}>
  <button
    type="button"
    class="rounded-md border border-line-strong-strong bg-surface px-2 py-1 text-sm text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60 aria-pressed:border-brand-600 aria-pressed:bg-brand-50"
    aria-pressed={voted === 'UPVOTE'}
    aria-label={t('vote.upvote', { label: target })}
    disabled={pending}
    onclick={() => void vote('UPVOTE')}
  >
    <span aria-hidden="true">▲</span>
  </button>

  <span class="text-xs text-ink-muted">{t('vote.score')}</span>
  <span class="min-w-6 text-center text-sm font-semibold tabular-nums">{formatted}</span>

  <button
    type="button"
    class="rounded-md border border-line-strong-strong bg-surface px-2 py-1 text-sm text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60 aria-pressed:border-brand-600 aria-pressed:bg-brand-50"
    aria-pressed={voted === 'DOWNVOTE'}
    aria-label={t('vote.downvote', { label: target })}
    disabled={pending}
    onclick={() => void vote('DOWNVOTE')}
  >
    <span aria-hidden="true">▼</span>
  </button>
</div>

<p role="status" class="mt-1 text-xs text-ink-muted">{info}</p>

{#if failure}
  <p role="alert" class="mt-1 text-xs text-negative">
    {t('vote.rejectedTitle')} — <span class="font-mono">{failure.code}</span> — {failure.message}
  </p>
{/if}
