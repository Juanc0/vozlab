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
     * `true` when the page is a **workspace**.
     *
     * A workspace fills the window: the area below the top of the screen
     * is the page, the page does not scroll and the footer has no room.
     * The graph page is the one.
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
    The bar of the shell is gone.

    It carried the mark of the product, its name, the workspace and the
    language — three of which the navigation column already says, and the
    fourth of which the column says too. A strip that repeats the column is
    a strip that costs the picture a row of pixels for nothing.

    What the bar really carried for a narrow screen is this one button: below
    `lg` the navigation is a drawer, and the drawer needs a way in. It floats
    over the page instead of owning a row, and it is never rendered where the
    column is.
  -->
  {#if navigation}
    <button
      type="button"
      class="fixed left-3 top-3 z-40 grid size-11 place-items-center rounded-control border border-rule bg-surface text-muted shadow-e1 hover:bg-raised hover:text-text lg:hidden"
      aria-expanded={shellState.navOpen}
      aria-controls={DRAWER_PANEL_ID}
      onclick={(event) => {
        // Safari does not focus a button that is clicked: the focus is
        // given to the button by hand, or the drawer cannot give it back
        // when it closes.
        event.currentTarget.focus();
        shellState.toggleNav();
      }}
    >
      <span aria-hidden="true" class="text-lg leading-none">☰</span>
      <span class="sr-only">{t('shell.openMenu')}</span>
    </button>
  {/if}

  <!--
    The language of the interface, where no navigation carries it.

    It changes the whole application, so it cannot live only in the column:
    the login and the join have no column, and the reader of a Spanish
    interface must be able to leave it. Where the navigation exists it sits
    in the foot of the column, and this copy renders nothing.
  -->
  {#if !navigation}
    <div class="fixed right-4 top-3 z-30">
      <LocaleSelector />
    </div>
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
