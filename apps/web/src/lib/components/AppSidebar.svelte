<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { logout } from '$lib/api/auth';
  import { forgetDevelopmentToken } from '$lib/auth/dev-sign-in';
  import { getApiClient, getLocaleState, getSessionState } from '$lib/state/context';
  import LocaleSelector from './LocaleSelector.svelte';
  import WorkspaceSelector from './WorkspaceSelector.svelte';

  const api = getApiClient();
  const session = getSessionState();
  const locale = getLocaleState();
  const t = locale.t;

  /** The routes of the application. The workspace is never a path segment. */
  const links = $derived([
    { href: '/', label: t('sidebar.graph') },
    { href: '/proposals', label: t('sidebar.proposals') },
    { href: '/discussions', label: t('sidebar.discussions') }
  ]);

  /** The name of the signed-in user, whatever the provider is. */
  const displayName = $derived(
    session.user?.fullName ??
      session.user?.anonymousAlias ??
      session.user?.email ??
      t('sidebar.signedInFallback')
  );

  let signingOut = $state(false);
  let signOutError = $state<string | null>(null);

  async function signOut(): Promise<void> {
    signingOut = true;
    signOutError = null;

    try {
      await logout(api);
    } catch (error) {
      signOutError = error instanceof Error ? error.message : t('sidebar.signOutFailed');
      signingOut = false;
      return;
    }

    session.clear();
    // A development token is kept in the tab so a reload does not cost the
    // role; signing out has to take it away as well.
    forgetDevelopmentToken();
    await goto('/login');
  }
</script>

<div class="flex h-full flex-col gap-6">
  <nav aria-label={t('sidebar.sectionsLabel')}>
    <ul class="space-y-1">
      {#each links as link (link.href)}
        <li>
          <a
            href={link.href}
            aria-current={page.url.pathname === link.href ? 'page' : undefined}
            class="block rounded-md px-2 py-1.5 text-sm font-medium text-ink-muted hover:bg-surface hover:text-ink aria-[current=page]:bg-surface aria-[current=page]:text-ink"
          >
            {link.label}
          </a>
        </li>
      {/each}
    </ul>
  </nav>

  <WorkspaceSelector />

  <LocaleSelector />

  <div class="mt-auto space-y-2 border-t border-line pt-4">
    <p class="text-xs text-ink-muted">
      {t('sidebar.signedInAs')}
      <span class="block truncate text-sm font-medium text-ink">{displayName}</span>
    </p>

    <button
      type="button"
      class="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
      disabled={signingOut}
      onclick={signOut}
    >
      {signingOut ? t('sidebar.signingOut') : t('sidebar.signOut')}
    </button>

    {#if signOutError}
      <p role="alert" class="text-xs text-negative">{signOutError}</p>
    {/if}
  </div>
</div>
