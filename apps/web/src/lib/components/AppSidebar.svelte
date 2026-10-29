<script lang="ts">
  /**
   * The navigation of the application.
   *
   * It is a **column** of sections, the workspace it belongs to and the
   * session that is signed in — and it **folds** into a rail of 56 pixels
   * when the reader asks for it: the canvas needs the room, and a graph is
   * read with the pointer.
   *
   * The rail is **not** a hiding: the sections stay reachable, each one
   * keeps its **accessible name** — the name of the section is still
   * announced — and the name is also the tooltip of the icon.
   *
   * What the rail does with the three things the column holds:
   *
   * - the **workspace selector** becomes a control that opens a menu with
   *   the same selector inside it: a `<select>` of the full names is a real
   *   form, and a form is not something that may be clipped to a letter;
   * - the **session** becomes a control that opens a menu with the identity
   *   and the sign-out inside it: the identity stays readable, and it is
   *   still announced by the control itself;
   * - the **language selector** sits at the bottom of the column, just
   *   **above** the session: it changes the whole application, and the
   *   sign-out — the way out — is the last thing of the column. Its rail
   *   version opens the same selector inside its own menu.
   */
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { logout } from '$lib/api/auth';
  import { forgetDevelopmentToken } from '$lib/auth/dev-sign-in';
  import {
    getApiClient,
    getLocaleState,
    getPanelsState,
    getSessionState,
    getWorkspaceState
  } from '$lib/state/context';
  import LocaleSelector from './LocaleSelector.svelte';
  import RailMenu from './RailMenu.svelte';
  import TenantSwitcher from './TenantSwitcher.svelte';
  import WorkspaceSelector from './WorkspaceSelector.svelte';

  /** The id of the navigation — the toggle of the rail points at it. */
  const NAVIGATION_ID = 'vozlab-navigation';

  interface Props {
    /**
     * The name of the product — the reader is inside it.
     */
    title?: string;
    /**
     * `true` when the column may be folded into its rail.
     *
     * The rail is for the **wide** screens: below `lg` the navigation is a
     * drawer, and a drawer of a rail of icons is a drawer of nothing.
     */
    collapsible?: boolean;
    /**
     * `true` when the column is folded into its rail of icons.
     *
     * The drawer of a narrow screen is never a rail: it is already a panel
     * over the content, and folding it would hide the very sections the
     * reader opened it for.
     */
    collapsed?: boolean;
  }

  let { title = 'VozLab', collapsible = false, collapsed = false }: Props = $props();

  const api = getApiClient();
  const session = getSessionState();
  const locale = getLocaleState();
  const panels = getPanelsState();
  const workspace = getWorkspaceState();
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
    { href: '/discussions', label: t('sidebar.discussions'), icon: 'discussions' },
    { href: '/admin', label: t('admin.title'), icon: 'proposals' },
    { href: '/request-access', label: t('requestAccess.title'), icon: 'discussions' }
  ]);

  /** The name of the signed-in user, whatever the provider is. */
  const displayName = $derived(
    session.user?.fullName ??
      session.user?.anonymousAlias ??
      session.user?.email ??
      t('sidebar.signedInFallback')
  );

  /** The workspace the screen is about. */
  const activeWorkspace = $derived(
    workspace.workspaces.find((item) => item.id === workspace.currentWorkspaceId) ?? null
  );

  /** The mark of the workspace in the rail: its first letter. */
  const workspaceMark = $derived(
    activeWorkspace === null ? '·' : activeWorkspace.name.trim().charAt(0).toUpperCase()
  );

  let signingOut = $state(false);
  let signOutError = $state<string | null>(null);

  /** The menu that is open — the workspace or the session. */
  let menu = $state<'workspace' | 'session' | null>(null);

  /** Whether the rail is showing the menu of the language. */
  let localeMenuOpen = $state(false);

  /** The control that opened the menu — the focus goes back to it. */
  let menuAnchor = $state<HTMLElement | null>(null);

  /** Opens the menu of a control of the rail. */
  function openMenu(kind: 'workspace' | 'session', event: MouseEvent): void {
    menuAnchor = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    menu = kind;
  }

  /** Closes the menu. */
  function closeMenu(): void {
    menu = null;
  }

  async function signOut(): Promise<void> {
    signingOut = true;
    signOutError = null;

    try {
      const endSessionUrl = await logout(api);
      session.clear();
      forgetDevelopmentToken();
      if (endSessionUrl) {
        window.location.href = endSessionUrl;
        return;
      }
      await goto('/login');
      return;
    } catch (error) {
      signOutError = error instanceof Error ? error.message : t('sidebar.signOutFailed');
      signingOut = false;
      return;
    }
  }
</script>

<!--
  The icon of a section. It is drawn with the ink of the interface, and the
  accent arrives only when the section is the current one.
-->
{#snippet sectionIcon(icon: string)}
  <span
    aria-hidden="true"
    class="grid size-4 shrink-0 place-items-center text-muted group-aria-[current=page]:text-accent"
  >
    {#if icon === 'graph'}
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
    {:else if icon === 'proposals'}
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
{/snippet}

<!--
  The session: who is signed in, and the way out.
-->
{#snippet sessionBlock()}
  <div class="space-y-3">
    <p class="text-small text-muted">
      {t('sidebar.signedInAs')}
      <span class="block truncate text-body font-medium text-text">{displayName}</span>
    </p>

    <!--
      The institution switcher: when the identity is linked to more than one
      ACTIVE tenant, the session moves without re-authenticating
      (v6/TASK-01). Hidden when there is nothing to switch.
    -->
    <TenantSwitcher />

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
{/snippet}

<div class="flex h-full flex-col gap-6">
  <!--
    The identity of the product: its mark and its name.

    The name is set in the **wordmark** size — one step above a section
    title — and the mark is drawn at thirty-two pixels: the name of the
    product is the first thing the column says, and it carries the
    spacing the column keeps from the top edge (the padding of the
    column, not a margin of its own).
  -->
  <div class="flex items-center gap-2.5 {collapsed ? 'justify-center' : ''}">
    <span aria-hidden="true" class="shrink-0 text-accent">
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
      >
        <path d="M6.5 6.5 17.5 6.5" />
        <path d="M6.5 6.5 12 17.5" />
        <path d="M17.5 6.5 12 17.5" />
        <circle cx="6.5" cy="6.5" r="2.4" fill="currentColor" stroke="none" />
        <circle cx="17.5" cy="6.5" r="2.4" />
        <circle cx="12" cy="17.5" r="2.4" />
      </svg>
    </span>

    {#if collapsed}
      <span class="sr-only">{title}</span>
    {:else}
      <span class="text-brand font-semibold leading-none text-text">{title}</span>
    {/if}
  </div>

  <!--
    The toggle of the rail. It is a **quiet** control — the accent is scarce
    and a fold is not an action of the screen — and it announces the state it
    leaves the navigation in.
  -->
  {#if collapsible}
    <div class={collapsed ? 'flex justify-center' : 'flex justify-end'}>
      <button
        type="button"
        class="btn-quiet grid size-11 place-items-center rounded-control text-muted hover:bg-raised hover:text-text"
        aria-controls={NAVIGATION_ID}
        aria-expanded={!collapsed}
        title={collapsed ? t('sidebar.expandNavigation') : t('sidebar.collapseNavigation')}
        onclick={() => panels.toggleNav()}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          class={collapsed ? 'rotate-180' : ''}
        >
          <path d="M10 3.5 5.5 8l4.5 4.5" />
        </svg>
        <span class="sr-only">
          {collapsed ? t('sidebar.expandNavigation') : t('sidebar.collapseNavigation')}
        </span>
      </button>
    </div>
  {/if}

  <nav id={NAVIGATION_ID} aria-label={t('sidebar.sectionsLabel')}>
    <p class="mb-2 px-2 text-small text-muted" class:sr-only={collapsed}>
      {t('sidebar.sectionsLabel')}
    </p>

    <ul class="space-y-0.5">
      {#each links as link (link.href)}
        <li>
          <a
            href={link.href}
            title={link.label}
            aria-current={page.url.pathname === link.href ? 'page' : undefined}
            class="group flex items-center gap-2.5 rounded-control px-2 py-2.5 text-body font-medium text-muted hover:bg-raised hover:text-text aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-ink {collapsed
              ? 'justify-center'
              : ''}"
          >
            {@render sectionIcon(link.icon)}

            {#if collapsed}
              <!--
                The name of the section is **not** dropped: it is the
                accessible name of the link and the tooltip of the icon.
              -->
              <span class="sr-only">{link.label}</span>
            {:else}
              <span>{link.label}</span>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
  </nav>

  {#if collapsed}
    <!--
      The rail: the workspace, the language and the session are three
      controls that open their own menu. Nothing is hidden — the menu
      holds the very same controls the column holds.
    -->
    <div class="mt-auto flex flex-col items-center gap-2 border-t border-rule pt-4">
      <button
        type="button"
        class="grid size-11 place-items-center rounded-control text-muted hover:bg-raised hover:text-text"
        title={t('locale.label')}
        aria-haspopup="dialog"
        aria-expanded={localeMenuOpen}
        onclick={(event) => {
          menuAnchor = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
          localeMenuOpen = !localeMenuOpen;
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="5.5" />
          <path d="M2.5 8h11" />
          <path d="M8 2.5c2.5 3 2.5 8 0 11-2.5-3-2.5-8 0-11z" />
        </svg>
        <span class="sr-only">{t('locale.label')}</span>
      </button>

      <button
        type="button"
        class="grid size-11 place-items-center rounded-control text-body font-semibold text-muted hover:bg-raised hover:text-text"
        title={activeWorkspace?.name ?? t('workspace.label')}
        aria-haspopup="dialog"
        aria-expanded={menu === 'workspace'}
        onclick={(event) => openMenu('workspace', event)}
      >
        <span aria-hidden="true">{workspaceMark}</span>
        <span class="sr-only">
          {t('sidebar.workspaceControl', { name: activeWorkspace?.name ?? t('workspace.noneSelected') })}
        </span>
      </button>

      <button
        type="button"
        class="grid size-11 place-items-center rounded-control text-muted hover:bg-raised hover:text-text"
        title={displayName}
        aria-haspopup="dialog"
        aria-expanded={menu === 'session'}
        onclick={(event) => openMenu('session', event)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="8" cy="5" r="2.6" />
          <path d="M3 13.5c0-2.4 2.2-4 5-4s5 1.6 5 4" />
        </svg>
        <span class="sr-only">{t('sidebar.sessionControl', { name: displayName })}</span>
      </button>
    </div>
  {:else}
    <WorkspaceSelector />

    <!--
      The foot of the column, at the very bottom: the **language** first
      and the **session** under it. The sign-out is the way out of the
      application, so it is the last thing of the column — and the
      language, which changes every screen of it, sits right above.
    -->
    <div class="mt-auto space-y-3 border-t border-rule pt-4">
      <div>
        <p class="mb-1 text-small text-muted">
          {t('locale.label')}
        </p>
        <LocaleSelector />
      </div>

      {@render sessionBlock()}
    </div>
  {/if}
</div>

<RailMenu
  open={localeMenuOpen}
  label={t('locale.label')}
  anchor={menuAnchor}
  onclose={() => {
    localeMenuOpen = false;
  }}
>
  <LocaleSelector />
</RailMenu>

<RailMenu
  open={menu === 'workspace'}
  label={t('sidebar.workspaceMenu')}
  anchor={menuAnchor}
  onclose={closeMenu}
>
  <WorkspaceSelector />
</RailMenu>

<RailMenu
  open={menu === 'session'}
  label={t('sidebar.sessionMenu')}
  anchor={menuAnchor}
  onclose={closeMenu}
>
  {@render sessionBlock()}
</RailMenu>
