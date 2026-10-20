<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { eventJoin } from '$lib/api/auth';
  import { isApiError } from '$lib/api/errors';
  import { adoptSession } from '$lib/auth/restore';
  import { getApiClient, getLocaleState, getSessionState, getWorkspaceState } from '$lib/state/context';

  const api = getApiClient();
  const session = getSessionState();
  const workspace = getWorkspaceState();
  const locale = getLocaleState();
  const t = locale.t;

  let code = $state('');
  let alias = $state('');
  let pending = $state(false);
  let failure = $state<{ code: string | null; message: string } | null>(null);

  /**
   * Whether the client has taken over the page.
   *
   * The page is server-rendered, so before the hydration the form has no
   * `submit` handler and the browser would perform a **native** submit: the
   * event code would land in the URL, and with it in the history and in the
   * access log. The code is the whole credential — it must never be in a
   * URL.
   *
   * The button stays disabled until the handler is attached. A disabled
   * submit button is also not the form's default button, so pressing
   * <kbd>Enter</kbd> in the field cannot submit it either. The form needs
   * JavaScript to work at all — the join is an API call from the browser —
   * so nothing is lost by waiting for it.
   */
  let hydrated = $state(false);

  onMount(() => {
    hydrated = true;
  });

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    failure = null;
    pending = true;

    try {
      const sessionDto = await eventJoin(api, {
        code: code.trim(),
        alias: alias.trim() === '' ? undefined : alias.trim()
      });

      const outcome = await adoptSession({ client: api, session, workspace }, sessionDto);

      if (outcome.status === 'no-membership') {
        failure = {
          code: null,
          message: t('join.noMembership')
        };
        return;
      }

      if (outcome.status !== 'restored') {
        failure = {
          code: outcome.error?.code ?? null,
          message: outcome.error?.message ?? t('join.failed')
        };
        return;
      }

      await goto('/');
    } catch (error) {
      // The API error envelope (`code` + `message`) is what the user sees —
      // never a raw HTTP status line.
      failure = isApiError(error)
        ? { code: error.code, message: error.message }
        : { code: null, message: t('join.failed') };
    } finally {
      pending = false;
    }
  }
</script>

<svelte:head>
  <title>{t('join.pageTitle')}</title>
</svelte:head>

<section class="mx-auto max-w-prose space-y-6">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">{t('join.heading')}</h1>
    <p class="mt-2 text-ink-muted">
      {t('join.intro')}
    </p>
  </div>

  <form class="space-y-5 rounded-card border border-line bg-surface p-6" onsubmit={submit}>
    <div>
      <label for="event-code" class="block text-sm font-medium text-ink">
        {t('join.codeLabel')} <span class="font-normal text-ink-muted">{t('common.required')}</span>
      </label>
      <input
        id="event-code"
        name="code"
        type="text"
        required
        minlength="16"
        maxlength="128"
        autocomplete="off"
        spellcheck="false"
        aria-required="true"
        aria-invalid={failure === null ? undefined : 'true'}
        aria-describedby={failure === null ? 'event-code-help' : 'event-code-help event-code-error'}
        class="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 font-mono text-sm"
        bind:value={code}
      />
      <p id="event-code-help" class="mt-1 text-xs text-ink-muted">
        {t('join.codeHelp')}
      </p>
    </div>

    <div>
      <label for="event-alias" class="block text-sm font-medium text-ink">
        {t('join.aliasLabel')} <span class="font-normal text-ink-muted">{t('common.optional')}</span>
      </label>
      <input
        id="event-alias"
        name="alias"
        type="text"
        maxlength="100"
        autocomplete="off"
        aria-describedby="event-alias-help"
        class="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
        bind:value={alias}
      />
      <p id="event-alias-help" class="mt-1 text-xs text-ink-muted">
        {t('join.aliasHelp')}
      </p>
    </div>

    {#if failure}
      <div
        id="event-code-error"
        role="alert"
        class="rounded-md border border-line bg-surface-muted p-3 text-sm"
      >
        {#if failure.code}
          <p class="font-mono font-semibold text-negative">{failure.code}</p>
        {/if}
        <p class={failure.code ? 'mt-1 text-ink' : 'text-ink'}>{failure.message}</p>
      </div>
    {/if}

    <button
      type="submit"
      class="rounded-md bg-brand-900 px-4 py-2 font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending || !hydrated}
    >
      {pending ? t('join.submitting') : t('join.submit')}
    </button>

    {#if !hydrated}
      <p class="text-xs text-ink-muted" role="status">{t('join.preparing')}</p>
    {/if}
  </form>

  <p class="text-sm text-ink-muted">
    {t('join.signInInstead')} <a href="/login" class="underline">{t('join.signInLink')}</a>.
  </p>
</section>
