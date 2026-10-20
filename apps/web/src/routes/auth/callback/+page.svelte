<script lang="ts">
  import { page } from '$app/state';
  import { ERROR_CODES } from '@vozlab/shared-types';
  import { isKnownErrorCode } from '$lib/api/errors';

  /**
   * The landing of a failed institutional login.
   *
   * The API redirects to `${WEB_ORIGIN}/auth/callback?error=ERR_…` when the
   * identity provider refuses the login, so this route has to exist for the
   * error to be readable instead of a `404`. The successful login never lands
   * here: it returns to the path the login started from.
   */
  const code = $derived(page.url.searchParams.get('error') ?? '');
  const known = $derived(isKnownErrorCode(code) ? code : null);
  const message = $derived(
    known !== null
      ? ERROR_CODES[known].message
      : 'The sign-in could not be completed. The identity provider did not accept the request.'
  );
</script>

<svelte:head>
  <title>The sign-in did not go through — VozLab</title>
</svelte:head>

<section class="mx-auto max-w-prose space-y-6">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">The sign-in did not go through</h1>
    <p class="mt-2 text-ink-muted">{message}</p>
  </div>

  {#if known}
    <p class="font-mono text-sm text-negative">{known}</p>
  {/if}

  <div class="flex flex-wrap gap-3">
    <a
      href="/login"
      class="rounded-md bg-brand-900 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
    >
      Try again
    </a>
    <a
      href="/join"
      class="rounded-md border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted"
    >
      Join with an event code
    </a>
  </div>
</section>
