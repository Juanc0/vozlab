<script lang="ts">
  import type { Snippet } from 'svelte';
  import { DRAWER_PANEL_ID } from '$lib/components/Drawer.svelte';
  import InstallPrompt from '$lib/components/InstallPrompt.svelte';
  import LocaleSelector from '$lib/components/LocaleSelector.svelte';
  import OfflineBanner from '$lib/components/OfflineBanner.svelte';
  import PwaStatus from '$lib/components/PwaStatus.svelte';
  import UpdatePrompt from '$lib/components/UpdatePrompt.svelte';
  import { getLocaleState } from '$lib/state/context';
  import { shellState } from '$lib/state/shell.svelte';

  interface Props {
    title?: string;
    /**
     * `true` when the page has a navigation to show.
     *
     * The button of the menu only makes sense where there is something to
     * open: the login and the join have no navigation.
     */
    navigation?: boolean;
    /**
     * The name of the active workspace — the **scope** of the screen.
     *
     * It is the breadcrumb of the scope: the switcher that changes it
     * lives in the navigation column, and the bar says which one is
     * active. It is `null` when no workspace is active yet (the session is
     * still being restored).
     */
    scope?: string | null;
    /**
     * `true` when the page is a **workspace**.
     *
     * A workspace fills the window: the area between the bar of the shell
     * and the bottom of the screen is the page, the page does not scroll
     * and the footer has no room. The graph page is the one.
     */
    workspace?: boolean;
    children?: Snippet;
  }

  let { title = 'VozLab', navigation = false, scope = null, workspace = false, children }: Props =
    $props();

  const locale = getLocaleState();
  const t = locale.t;

  /** The element of the notices of the shell — it is measured. */
  let notices: HTMLDivElement | undefined = $state();

  /**
   * The height of the notices.
   *
   * The panels of a workspace float over the picture, and the notices are
   * a banner over it too: the panels move below the banner, and the height
   * of the banner is published as a custom property for them.
   */
  let noticeHeight = $state(0);

  $effect(() => {
    const element = notices;

    if (element === undefined) {
      return;
    }

    const report = (): void => {
      noticeHeight = element.offsetHeight;
    };

    report();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(report);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  });
</script>

<!--
  The shell of the application.

  A **workspace** is the window itself: the shell is exactly as tall as
  the visual viewport (`100dvh`, not `100vh` — the chrome of a mobile
  browser changes the height of `vh`) and it never scrolls. Every other
  page is a document that may be longer than the window.
-->
<div
  style="--notice-h: {noticeHeight}px"
  class="flex flex-col bg-ground text-text {workspace
    ? 'relative h-dvh overflow-hidden'
    : 'min-h-dvh'}"
>
  <a
    href="#main-content"
    class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-accent focus:px-4 focus:py-2 focus:text-white"
  >
    {t('shell.skipToContent')}
  </a>

  <!--
    The bar of the shell.
    `
    It is **flat**: the same ground as the page, divided from it by a
    single 1px rule. It carries the product — its mark and its name — and
    the scope of the screen; the navigation and the session live in the
    column on the left.
  -->
  <header class="sticky top-0 z-30 border-b border-rule bg-ground">
    <div class="mx-auto flex h-16 w-full items-center gap-3 px-4 sm:px-6">
      <!--
        The menu of the navigation. It is in the header and **only** on a
        narrow screen: above `lg` the navigation is the column it has always
        been, and a second control for it would be a control that does the
        same thing twice.
      -->
      {#if navigation}
        <button
          type="button"
          class="-ml-2 grid size-11 shrink-0 place-items-center rounded-control text-muted hover:bg-raised hover:text-text lg:hidden"
          aria-expanded={shellState.navOpen}
          aria-controls={DRAWER_PANEL_ID}
          onclick={(event) => {
            // Safari does not focus a button that is clicked: the focus is
            // given to the button by hand, or the drawer cannot give it
            // back when it closes.
            event.currentTarget.focus();
            shellState.toggleNav();
          }}
        >
          <span aria-hidden="true" class="text-lg leading-none">☰</span>
          <span class="sr-only">{t('shell.openMenu')}</span>
        </button>
      {/if}

      <!--
        The mark of the product.

        It is the object of the product drawn small: three nodes of the
        graph and the lines that join them, in the accent. It is never a
        square with a letter in it.
      -->
      <span aria-hidden="true" class="shrink-0 text-accent">
        <svg
          width="24"
          height="24"
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

      <span class="text-section font-semibold leading-none text-text">{title}</span>

      <div class="ml-auto flex items-center gap-4">
        <!--
          The scope of the screen: the workspace every read and every write
          is made in. It is the breadcrumb of the scope — the switcher that
          changes it is in the navigation column.
        -->
        {#if scope !== null}
          <span class="hidden text-body text-muted sm:inline">{scope}</span>
        {/if}

        <!--
          The language of the interface. It lives in the chrome of the
          shell and not in the navigation column: it changes the whole
          application, including the screens that have no navigation.
        -->
        <LocaleSelector />
      </div>
    </div>
  </header>

  <!--
    The notices of the shell.

    They sit between the header and the content: the connectivity, the
    state of the PWA, the install offer and the pending service-worker
    update are the things the user must know about before reading anything
    else. Each notice renders nothing at all when it does not apply — an
    empty strip is never left behind.

    In a **workspace** they do not take height from the picture: a notice
    that appears would resize the canvas, and the picture would be cut by
    its own edge. They are a toast **over** the picture instead, in the
    corner the panels of the workspace leave free, and the panels leave
    room for it.
  -->
  <div
    bind:this={notices}
    class={workspace
      ? 'absolute bottom-0 right-4 z-20 w-[min(32rem,calc(100%-27rem))] max-[47.99rem]:left-0 max-[47.99rem]:right-0 max-[47.99rem]:w-auto'
      : ''}
  >
    <OfflineBanner />
    <PwaStatus />
    <InstallPrompt />
    <UpdatePrompt />
  </div>

  <!--
    The content of the shell is **not** capped: the graph page needs the
    whole window for its canvas and its inspector. The pages that read
    better in a narrow column cap themselves.

    A workspace takes the whole area: the canvas is that area, and the
    panels float over it.
  -->
  <main
    id="main-content"
    class="w-full flex-1 {workspace
      ? 'min-h-0 overflow-hidden'
      : 'mx-auto px-4 py-6 sm:px-6 sm:py-8'}"
  >
    {@render children?.()}
  </main>

  <!--
    The footer has no room in a workspace: the window belongs to the
    picture.
  -->
  {#if !workspace}
    <footer class="border-t border-rule">
      <div class="mx-auto w-full px-4 py-4 text-small text-muted sm:px-6">
        {t('shell.footer')}
      </div>
    </footer>
  {/if}
</div>
