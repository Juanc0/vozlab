<script lang="ts">
  import { page } from '$app/state';
  import { loginUrl } from '$lib/api/auth';
  import { loginRedirectPath } from '$lib/auth/login-redirect';
  import { navigateTo } from '$lib/auth/redirect';
  import { getApiClient } from '$lib/state/context';

  const api = getApiClient();

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

  <div class="rounded-card border border-line bg-surface p-6">
    <h2 class="text-lg font-semibold">Local development</h2>
    <p class="mt-2 text-sm text-ink-muted">
      Without an identity provider there is no sign-in to redirect to. Mint a development session
      for the API instead and use it as the bearer token:
    </p>
    <!--
      The command is wider than the screen on a narrow viewport: the block
      is a focusable region so that a keyboard user can scroll it (WCAG 2.2
      SC 2.1.1).
    -->
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
</section>
