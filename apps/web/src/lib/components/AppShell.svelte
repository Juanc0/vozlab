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
    /**
     * `true` when the page has a navigation to show.
     *
     * The button of the menu only makes sense where there is something to
     * open: the login and the join have no navigation.
     */
    navigation?: boolean;
    /**
     * The name
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

  let { navigation = false, workspace = false, children }: Props = $props();

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
  class="relative flex flex-col bg-ground text-text {workspace
    ? 'h-dvh overflow-hidden'
    : 'min-h-dvh'}"
>
  <a
    href="#main-content"
    class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-accent focus:px-4 focus:py-2 focus:text-white"
  >
    {t('shell.skipToContent')}
  </a>

  <!--
    The mark and the name live in the **navigation column** now. The shell
    keeps only the control a narrow screen needs: the button that opens
    the drawer of the navigation. It floats in the corner of the content —
    there is no bar under it, so it is a quiet control over the page.
  -->
  {#if navigation && !workspace}
    <!-- A document may scroll: the button travels with it. -->
    <button
      type="button"
      class="absolute left-4 top-4 z-40 grid size-11 place-items-center rounded-control border border-border bg-surface text-muted shadow-float hover:bg-raised hover:text-text lg:hidden"
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
  {:else if navigation}
    <!--
      A workspace does not scroll: the button does not need a card.
    -->
    <button
      type="button"
      class="absolute left-4 top-4 z-40 grid size-11 place-items-center rounded-control text-muted hover:bg-raised hover:text-text lg:hidden"
      aria-expanded={shellState.navOpen}
      aria-controls={DRAWER_PANEL_ID}
      onclick={(event) => {
        event.currentTarget.focus();
        shellState.toggleNav();
      }}
    >
      <span aria-hidden="true" class="text-lg leading-none">☰</span>
      <span class="sr-only">{t('shell.openMenu')}</span>
    </button>
  {/if}

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
