<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { loginUrl } from '$lib/api/auth';
  import { isDevelopmentBuild } from '$lib/config/environment';
  import { signInWithDevelopmentToken } from '$lib/auth/dev-sign-in';
  import { loginRedirectPath } from '$lib/auth/login-redirect';
  import { navigateTo } from '$lib/auth/redirect';
  import { getApiClient, getSessionState, getWorkspaceState } from '$lib/state/context';

  const api = getApiClient();
  const session = getSessionState();
  const workspace = getWorkspaceState();

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

  /** The API URL that starts the OIDC login. */
  const url = $derived(loginUrl(api, target));

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
          ? 'That is not a bearer token. Mint one with db:mint-token and paste the whole value.'
          : outcome.status === 'rejected'
            ? 'The API rejected the token: it is expired, revoked or not valid.'
            : 'The API could not be reached.';
    } finally {
      devPending = false;
    }
  }
</script>

<svelte:head>
  <title>Sign in — VozLab</title>
</svelte:head>

<section class="mx-auto max-w-prose space-y-6">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">Sign in to VozLab</h1>
    <p class="mt-2 text-ink-muted">
      VozLab does not keep passwords. Your institution's identity provider authenticates you and
      hands a session back to this app; the app only ever sees the session.
    </p>
  </div>

  <div class="rounded-card border border-line bg-surface p-6">
    <button
      type="button"
      class="rounded-md bg-brand-900 px-4 py-2 font-medium text-white hover:bg-brand-800"
      onclick={startLogin}
    >
      Continue with your institution
    </button>
    <p class="mt-3 text-sm text-ink-muted">
      The browser is sent to the identity provider and returns here when it is done.
    </p>
  </div>

  <div class="rounded-card border border-line bg-surface p-6">
    <h2 class="text-lg font-semibold">Joining an event?</h2>
    <p class="mt-2 text-sm text-ink-muted">
      An event code is a one-off credential for a single workspace. It needs no account and no
      identity provider.
    </p>
    <a
      href="/join"
      class="mt-3 inline-block rounded-md border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted"
    >
      Join with an event code
    </a>
  </div>

  {#if isDevelopmentBuild()}
    <div class="rounded-card border border-line bg-surface p-6">
      <h2 class="text-lg font-semibold">Development sign-in</h2>
      <p class="mt-2 text-sm text-ink-muted">
        An event code grants the <code>MEMBER</code> role, and a member can neither approve a
        proposal nor auto-apply one. Paste a token minted locally to act as one of the dev
        identities — the maintainer is the author of the seeded graph, so it is the one who can
        approve its proposals.
      </p>

      <form class="mt-4 space-y-3" onsubmit={submitDevSignIn}>
        <label for="dev-token" class="block text-sm font-medium text-ink">Development token</label>
        <input
          id="dev-token"
          type="text"
          bind:value={devToken}
          autocomplete="off"
          spellcheck="false"
          class="w-full rounded-md border border-line-strong bg-surface px-3 py-2 font-mono text-xs"
          placeholder="eyJhbGciOiJIUzI1NiIs…"
        />

        <button
          type="submit"
          class="rounded-md bg-brand-900 px-4 py-2 font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={devPending || !hydrated}
        >
          {devPending ? 'Signing in…' : 'Sign in as this identity'}
        </button>

        {#if !hydrated}
          <p class="text-xs text-ink-muted" role="status">Preparing the form…</p>
        {/if}

        {#if devFailure}
          <p class="text-sm text-negative" role="alert">{devFailure}</p>
        {/if}
      </form>

      <p class="mt-4 text-sm text-ink-muted">
        The token stays in memory. It is never written to the browser's storage, and this panel
        exists only in a development build.
      </p>

      <!--
        The commands are wider than the screen on a narrow viewport: the
        block is a focusable region so that a keyboard user can scroll it
        (WCAG 2.2 SC 2.1.1).
      -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <pre
        class="mt-3 overflow-x-auto rounded-md bg-surface-muted p-3 text-xs"
        role="region"
        aria-label="The commands that mint a development session"
        tabindex="0"
      ><code>pnpm --filter @vozlab/database db:mint-token -- --as maintainer
pnpm --filter @vozlab/database db:mint-token -- --as moderator
pnpm --filter @vozlab/database db:mint-token -- --as member</code></pre>
    </div>
  {:else}
    <div class="rounded-card border border-line bg-surface p-6">
      <h2 class="text-lg font-semibold">Local development</h2>
      <p class="mt-2 text-sm text-ink-muted">
        Without an identity provider there is no sign-in to redirect to. Mint a development session
        for the API instead and use it as the bearer token:
      </p>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <pre
        class="mt-3 overflow-x-auto rounded-md bg-surface-muted p-3 text-xs"
        role="region"
        aria-label="The command that mints a development token"
        tabindex="0"
      ><code>pnpm --filter @vozlab/database db:mint-token -- --as maintainer</code></pre>
      <p class="mt-2 text-sm text-ink-muted">
        That token belongs to the API (scripts, workers, <code>curl</code>). The app itself needs an
        identity provider or an event code.
      </p>
      <p class="mt-2 text-sm text-ink-muted">
        The runbook describes the whole flow: <code>docs/runbook-dev.md</code>.
      </p>
    </div>
  {/if}
</section>
