<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { loginUrl } from '$lib/api/auth';
  import { isDevelopmentBuild } from '$lib/config/environment';
  import { signInWithDevelopmentToken } from '$lib/auth/dev-sign-in';
  import { loginRedirectPath } from '$lib/auth/login-redirect';
  import { navigateTo } from '$lib/auth/redirect';
  import { getApiClient, getLocaleState, getSessionState, getWorkspaceState } from '$lib/state/context';
  import RichText from '$lib/components/RichText.svelte';

  const api = getApiClient();
  const session = getSessionState();
  const workspace = getWorkspaceState();
  const locale = getLocaleState();
  const t = locale.t;

  /**
   * Where the browser has to come back to.
   *
   * It is the path the user is on (or the `next` the guard left behind), and
   * it is always a path on this origin: `loginRedirectPath` refuses anything
   * that could send the user to another site.
   */
  const target = $derived(
    loginRedirectPath(page.url.pathname, page.url.searchParams.get('next'))
  );

  /** Selected provider hint. */
  let selectedProvider = $state<string | undefined>(undefined);

  /** The API URL that starts the OIDC login. */
  const url = $derived(
    loginUrl(api, {
      redirectPath: target,
      kcIdpHint: selectedProvider,
    })
  );

  function startLogin(): void {
    // A document navigation: the API answers with a `302` to the identity
    // provider, and the router must not try to read that as a page.
    navigateTo(url);
  }

  // --- The development sign-in -------------------------------------------
  //
  // It exists only in a dev build, and only because the event-code join
  // grants `MEMBER`: a member can look at the governance screens but cannot
  // approve a proposal or auto-apply one, and those are the flows the
  // demonstration is about.

  let devToken = $state('');
  let devPending = $state(false);
  let devFailure = $state<string | null>(null);

  /**
   * Whether the client has taken over the page.
   *
   * Before the hydration the form has no `submit` handler, and the browser
   * would perform a **native** submit: the token would land in the URL, in
   * the history and in the access log. A disabled submit button is also not
   * the form's default button, so pressing <kbd>Enter</kbd> cannot submit
   * it either.
   */
  let hydrated = $state(false);

  onMount(() => {
    hydrated = true;
  });

  async function submitDevSignIn(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    devFailure = null;
    devPending = true;

    try {
      const outcome = await signInWithDevelopmentToken(
        { client: api, session, workspace },
        devToken
      );

      if (outcome.status === 'signed-in') {
        // The token lives in memory only: a client-side navigation keeps it.
        await goto(target);
        return;
      }

      devFailure =
        outcome.status === 'invalid-token'
          ? t('login.devErrorInvalidToken')
          : outcome.status === 'rejected'
            ? t('login.devErrorRejected')
            : t('login.devErrorUnreachable');
    } finally {
      devPending = false;
    }
  }
</script>

<svelte:head>
  <title>{t('login.pageTitle')}</title>
</svelte:head>

<section class="mx-auto max-w-[39rem] space-y-6">
  <div>
    <h1>{t('login.heading')}</h1>
    <p class="mt-2 max-w-measure text-body text-muted">
      {t('login.intro')}
    </p>
  </div>

  <div class="rounded-card bg-brand-100 p-6">
    <h2 class="mb-3">{t('login.continue')}</h2>
    <p class="mb-4 text-body text-muted max-w-measure">
      {t('login.continueHelp')}
    </p>

    <div class="grid gap-3">
      <button
        type="button"
        class="btn btn-primary w-full justify-start gap-3"
        onclick={() => { selectedProvider = undefined; startLogin(); }}
      >
        <span class="text-lg">🔐</span>
        <span>{t('login.providerLocal')}</span>
      </button>

      <button
        type="button"
        class="btn btn-secondary w-full justify-start gap-3"
        onclick={() => { selectedProvider = 'google'; startLogin(); }}
      >
        <span class="text-lg">G</span>
        <span>{t('login.providerGoogle')}</span>
      </button>

      <button
        type="button"
        class="btn btn-secondary w-full justify-start gap-3"
        onclick={() => { selectedProvider = 'microsoft'; startLogin(); }}
      >
        <span class="text-lg">M</span>
        <span>{t('login.providerMicrosoft')}</span>
      </button>
    </div>
  </div>

  <div class="rounded-card bg-brand-100 p-6">
    <h2>{t('login.joiningHeading')}</h2>
    <p class="mt-2 text-body text-muted max-w-measure">
      {t('login.joiningText')}
    </p>
    <a
      href="/join"
      class="btn btn-secondary mt-3"
    >
      {t('common.joinWithCode')}
    </a>
  </div>

  {#if isDevelopmentBuild()}
    <div class="rounded-card bg-brand-100 p-6">
      <h2>{t('login.devHeading')}</h2>
      <p class="mt-2 text-body text-muted max-w-measure">
        <RichText text={t('login.devText')} />
      </p>

      <form class="mt-4 space-y-3" onsubmit={submitDevSignIn}>
        <label for="dev-token" class="field-label">
          {t('login.devTokenLabel')}
        </label>
        <input
          id="dev-token"
          type="text"
          bind:value={devToken}
          autocomplete="off"
          spellcheck="false"
          class="field w-full font-mono"
          placeholder="eyJhbGciOiJIUzI1NiIs…"
        />

        <button
          type="submit"
          class="btn btn-primary"
          disabled={devPending || !hydrated}
        >
          {devPending ? t('login.devSigningIn') : t('login.devSubmit')}
        </button>

        {#if !hydrated}
          <p class="text-small text-muted" role="status">{t('login.devPreparing')}</p>
        {/if}

        {#if devFailure}
          <p class="text-body text-pill-negative-ink" role="alert">{devFailure}</p>
        {/if}
      </form>

      <p class="mt-4 text-body text-muted max-w-measure">
        {t('login.devTokenNote')}
      </p>

      <!--
        The commands are wider than the screen on a narrow viewport: the
        block is a focusable region so that a keyboard user can scroll it
        (WCAG 2.2 SC 2.1.1).
      -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <pre
        class="mt-3 overflow-x-auto rounded-control bg-ground p-3 text-small"
        role="region"
        aria-label={t('login.devCommandsLabel')}
        tabindex="0"
      ><code>pnpm --filter @vozlab/database db:mint-token -- --as maintainer
pnpm --filter @vozlab/database db:mint-token -- --as moderator
pnpm --filter @vozlab/database db:mint-token -- --as member</code></pre>
    </div>
  {:else}
    <div class="rounded-card bg-brand-100 p-6">
      <h2>{t('login.localHeading')}</h2>
      <p class="mt-2 text-body text-muted max-w-measure">
        {t('login.localText')}
      </p>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <pre
        class="mt-3 overflow-x-auto rounded-control bg-ground p-3 text-small"
        role="region"
        aria-label={t('login.localCommandLabel')}
        tabindex="0"
      ><code>pnpm --filter @vozlab/database db:mint-token -- --as maintainer</code></pre>
      <p class="mt-2 text-body text-muted max-w-measure">
        <RichText text={t('login.localNote')} />
      </p>
      <p class="mt-2 text-body text-muted max-w-measure">
        <RichText text={t('login.localRunbook')} />
      </p>
    </div>
  {/if}
</section>
