<script lang="ts">
  /**
   * A menu that **floats** over the rail of the navigation.
   *
   * The rail is 56 pixels wide: a workspace selector and the identity of the
   * session do not fit in it, and they are not things that may be dropped.
   * The menu holds them: it opens next to the control that opened it, and it
   * is a **dialog** — the focus goes in, <kbd>Escape</kbd> closes it and the
   * focus goes back to the control.
   *
   * The menu is one of the few things the design system allows a shadow on:
   * it truly floats over the picture of the workspace.
   */
  import type { Snippet } from 'svelte';

  interface Props {
    /** `true` while the menu is open. */
    open: boolean;
    /** The name of the menu — what the screen reader announces. */
    label: string;
    /** The control that opened the menu — the focus goes back to it. */
    anchor?: HTMLElement | null;
    /** Called when the menu must close. */
    onclose: () => void;
    /** The content of the menu. */
    children?: Snippet;
  }

  let { open, label, anchor = null, onclose, children }: Props = $props();

  /** The panel of the menu — it is measured and it takes the focus. */
  let panel: HTMLElement | undefined = $state();

  /** Where the panel floats: next to the control that opened it. */
  let position = $state('top: 0; left: 0;');

  /** The width of the panel — it is the same on every screen. */
  const WIDTH = 256;

  /** Whether the menu was open on the previous run of the effect. */
  let wasOpen = false;

  $effect(() => {
    const isOpen = open;

    if (isOpen) {
      const element = anchor;

      if (element !== null) {
        const rect = element.getBoundingClientRect();
        const viewportWidth = typeof window === 'undefined' ? WIDTH : window.innerWidth;
        const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;

        // The menu opens to the right of the rail, and it never leaves the
        // window: a menu that runs off the edge is a menu nobody can read.
        const left = Math.max(8, Math.min(rect.right + 8, viewportWidth - WIDTH - 8));

        // It also never leaves the window **vertically**: the control of
        // the rail is at the bottom of the column, and the menu opens
        // upwards when there is no room below it.
        const height = panel?.offsetHeight ?? 0;
        const top = Math.max(8, Math.min(rect.top, viewportHeight - height - 8));

        position = `top: ${top}px; left: ${left}px;`;
      }

      panel?.focus();
    } else if (wasOpen) {
      // The menu is closed: the focus goes back to the control that opened
      // it, or the reader is left at the top of the document.
      anchor?.focus();
    }

    wasOpen = isOpen;
  });

  /** <kbd>Escape</kbd> closes the menu. */
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      onclose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!--
    The veil that closes the menu when the reader clicks outside of it. It is
    not a modal: the menu is a small thing over the picture, and the picture
    does not need to be inert.
  -->
  <div class="fixed inset-0 z-40" aria-hidden="true" onclick={onclose}></div>

  <div
    bind:this={panel}
    role="dialog"
    aria-label={label}
    tabindex="-1"
    style={position}
    class="fixed z-50 max-h-[calc(100dvh-1rem)] w-64 overflow-y-auto rounded-card border border-border bg-surface p-3 shadow-float"
  >
    {@render children?.()}
  </div>
{/if}
