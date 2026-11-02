<script lang="ts">
  /**
   * The modal shell of the creation forms.
   *
   * A native `<dialog>` is used: in a browser it gives the modal semantics
   * (the rest of the page is inert, `Escape` closes it, the focus is
   * trapped) for free.
   *
   * The shell also owns the focus **explicitly**, because the focus
   * behaviour is part of the contract of the form and must not depend on
   * the browser: the focus moves into the dialog when it opens and returns
   * to the control that opened it when it closes.
   *
   * `showModal()` is not implemented by every DOM (jsdom among them), so the
   * shell falls back to the `open` attribute and implements the focus trap
   * and `Escape` itself. Both paths behave the same way for the user.
   */
  import type { Snippet } from 'svelte';
  import { focusFirstControl, trapTabKey } from '$lib/a11y/focus-trap';
  import { getLocaleState } from '$lib/state/context';

  interface Props {
    /** `true` while the dialog is open. */
    open: boolean;
    /** The title of the dialog — it names the dialog for the screen readers. */
    title: string;
    /** Called when the dialog must close (the button, `Escape`, …). */
    onclose: () => void;
    /** The content of the dialog. */
    children?: Snippet;
    /** The id of the element that describes the dialog. */
    describedby?: string;
  }

  let { open, title, onclose, children, describedby }: Props = $props();

  const locale = getLocaleState();
  const t = locale.t;

  const uid = $props.id();
  const titleId = `dialog-title-${uid}`;

  let dialog: HTMLDialogElement | undefined = $state();

  /** The control that had the focus before the dialog opened. */
  let opener: HTMLElement | null = null;

  /** `true` when the DOM implements `showModal()` (a real browser). */
  let native = false;

  /**
   * Opens and closes the dialog with the focus.
   *
   * The effect reads `open` and nothing else: the content of the dialog is
   * re-rendered by its own component, it never re-opens this one.
   */
  $effect(() => {
    if (!open) {
      return;
    }

    const element = dialog;
    if (element === undefined) {
      return;
    }

    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    native = typeof element.showModal === 'function';

    if (native) {
      element.showModal();
    } else {
      element.setAttribute('open', '');
      element.addEventListener('keydown', onKeydown);
    }

    focusFirstControl(element);

    return () => {
      element.removeEventListener('keydown', onKeydown);

      if (element.open) {
        if (typeof element.close === 'function') {
          element.close();
        } else {
          element.removeAttribute('open');
        }
      }

      opener?.focus();
      opener = null;
    };
  });

  /** The native `close` event: the browser closed the dialog (`Escape`). */
  function handleClosed(): void {
    // The parent may already have closed it (a successful creation): in that
    // case there is nothing left to report.
    if (open) {
      onclose();
    }
  }

  /** Closes the dialog from the inside (the button of the shell). */
  function closeNow(): void {
    const element = dialog;
    if (element === undefined) {
      return;
    }

    if (native && typeof element.close === 'function') {
      element.close();
    } else {
      element.removeAttribute('open');
    }

    onclose();
  }

  /**
   * The keyboard of the fallback path.
   *
   * A native modal dialog traps the focus and closes on `Escape` by itself;
   * the fallback has to do both. The trap is the one of the panels of the
   * app (`$lib/a11y/focus-trap`): there is only one.
   */
  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeNow();
      return;
    }

    const element = dialog;
    if (element === undefined) {
      return;
    }

    trapTabKey(event, element);
  }
</script>

<dialog
  bind:this={dialog}
  id="vozlab-dialog-{uid}"
  class="m-auto w-[min(34rem,calc(100vw-1rem))] rounded-card bg-surface p-0 text-text shadow-float backdrop:bg-text/40"
  aria-labelledby={titleId}
  aria-describedby={describedby}
  tabindex="-1"
  onclose={handleClosed}
>
  {#if open}
    <!--
      The dialog fits a phone: its height is a fraction of the **visual**
      viewport (`dvh`, not `vh`: the chrome of a mobile browser changes the
      height of `vh`) and its content scrolls inside it.
    -->
    <div class="max-h-[85dvh] overflow-y-auto p-4 sm:p-6">
      <div class="flex items-start justify-between gap-4">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          class="btn btn-quiet"
          onclick={closeNow}
        >
          {t('common.close')}
        </button>
      </div>

      <div class="mt-4">
        {@render children?.()}
      </div>
    </div>
  {/if}
</dialog>
