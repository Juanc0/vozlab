<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { logout } from '$lib/api/auth';
  import { forgetDevelopmentToken } from '$lib/auth/dev-sign-in';
  import { getApiClient, getLocaleState, getSessionState } from '$lib/state/context';
  import WorkspaceSelector from './WorkspaceSelector.svelte';

  const api = getApiClient();
  const session = getSessionState();
  const locale = getLocaleState();
  const t = locale.t;

  /**
   * The routes of the application. The workspace is never a path segment.
   *
   * Each destination carries the **icon** it is drawn with: the icon is the
   * only place where the full accent is allowed on the navigation, and it
   * is what makes the active row readable at a glance.
   */
  const links = $derived([
    { href: '/', label: t('sidebar.graph'), icon: 'graph' },
    { href: '/proposals', label: t('sidebar.proposals'), icon: 'proposals' },
    { href: '/discussions', label: t('sidebar.discussions'), icon: 'discussions' }
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
    <p class="mb-2 px-2 text-small text-muted">{t('sidebar.sectionsLabel')}</p>

    <ul class="space-y-0.5">
      {#each links as link (link.href)}
        <li>
          <a
            href={link.href}
            aria-current={page.url.pathname === link.href ? 'page' : undefined}
            class="group flex items-center gap-2.5 rounded-control px-2 py-2.5 text-body font-medium text-muted hover:bg-raised hover:text-text aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-ink"
          >
            <span
              aria-hidden="true"
              class="grid size-4 shrink-0 place-items-center text-muted group-aria-[current=page]:text-accent"
            >
              {#if link.icon === 'graph'}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                >
                  <path d="M4.5 4 11.5 4" />
                  <path d="M4.5 4 8 12" />
                  <path d="M11.5 4 8 12" />
                  <circle cx="4.5" cy="4" r="1.6" fill="currentColor" stroke="none" />
                  <circle cx="11.5" cy="4" r="1.6" />
                  <circle cx="8" cy="12" r="1.6" />
                </svg>
              {:else if link.icon === 'proposals'}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M4 2.5h6l2.5 2.5v8.5H4z" />
                  <path d="M6 8h4" />
                  <path d="M6 10.5h2.5" />
                </svg>
              {:else}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M2.5 3.5h8.5v6H7l-3 3v-3h-1.5z" />
                  <path d="M13.5 7.5v4.5H8" />
                </svg>
              {/if}
            </span>

            <span>{link.label}</span>
          </a>
        </li>
      {/each}
    </ul>
  </nav>

  <WorkspaceSelector />

  <div class="mt-auto space-y-3 border-t border-rule pt-4">
    <p class="text-small text-muted">
      {t('sidebar.signedInAs')}
      <span class="block truncate text-body font-medium text-text">{displayName}</span>
    </p>

    <button
      type="button"
      class="btn btn-secondary w-full"
      disabled={signingOut}
      onclick={signOut}
    >
      {signingOut ? t('sidebar.signingOut') : t('sidebar.signOut')}
    </button>

    {#if signOutError}
      <p role="alert" class="text-small text-pill-negative-ink">{signOutError}</p>
    {/if}
  </div>
</div>
