<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { logout } from '$lib/api/auth';
  import { getApiClient, getSessionState } from '$lib/state/context';
  import WorkspaceSelector from './WorkspaceSelector.svelte';

  const api = getApiClient();
  const session = getSessionState();

  /** The routes of the application. The workspace is never a path segment. */
  const links = [
    { href: '/', label: 'Graph' },
    { href: '/proposals', label: 'Proposals' },
    { href: '/discussions', label: 'Discussions' }
  ];

  /** The name of the signed-in user, whatever the provider is. */
  const displayName = $derived(
    session.user?.fullName ?? session.user?.anonymousAlias ?? session.user?.email ?? 'Signed in'
  );

  let signingOut = $state(false);
  let signOutError = $state<string | null>(null);

  async function signOut(): Promise<void> {
    signingOut = true;
    signOutError = null;

    try {
      await logout(api);
    } catch (error) {
      signOutError = error instanceof Error ? error.message : 'The sign-out failed.';
      signingOut = false;
      return;
    }

    session.clear();
    await goto('/login');
  }
</script>

<div class="flex h-full flex-col gap-6">
  <nav aria-label="Sections">
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

  <div class="mt-auto space-y-2 border-t border-line pt-4">
    <p class="text-xs text-ink-muted">
      Signed in as
      <span class="block truncate text-sm font-medium text-ink">{displayName}</span>
    </p>

    <button
      type="button"
      class="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
      disabled={signingOut}
      onclick={signOut}
    >
      {signingOut ? 'Signing out…' : 'Sign out'}
    </button>

    {#if signOutError}
      <p role="alert" class="text-xs text-negative">{signOutError}</p>
    {/if}
  </div>
</div>
