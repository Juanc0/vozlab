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

  const uid = $props.id();
  const titleId = `dialog-title-${uid}`;

  let dialog: HTMLDialogElement | undefined = $state();

  /** The control that had the focus before the dialog opened. */
  let opener: HTMLElement | null = null;

  /** `true` when the DOM implements `showModal()` (a real browser). */
  let native = false;

  /** The elements a keyboard user can reach inside the dialog. */
  const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

    focusFirst(element);

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
   * the fallback has to do both.
   */
  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeNow();
      return;
    }

    const element = dialog;
    if (event.key !== 'Tab' || element === undefined) {
      return;
    }

    const focusable = focusableElements(element);
    if (focusable.length === 0) {
      event.preventDefault();
      element.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === element)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || active === element)) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Moves the focus to the first control of the dialog. */
  function focusFirst(element: HTMLElement): void {
    // A control may ask for the focus explicitly (`data-autofocus`): the
    // first field of a form is more useful than the close button.
    const preferred = element.querySelector<HTMLElement>('[data-autofocus]');
    const focusable = focusableElements(element);
    (preferred ?? focusable[0] ?? element).focus();
  }

  /** The reachable controls of the dialog. */
  function focusableElements(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => !element.hasAttribute('hidden') && element.closest('[hidden]') === null
    );
  }
</script>

<dialog
  bind:this={dialog}
  id="vozlab-dialog-{uid}"
  class="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40"
  aria-labelledby={titleId}
  aria-describedby={describedby}
  tabindex="-1"
  onclose={handleClosed}
>
  {#if open}
    <div class="max-h-[85vh] overflow-y-auto p-6">
      <div class="flex items-start justify-between gap-4">
        <h2 id={titleId} class="text-lg font-semibold tracking-tight">{title}</h2>
        <button
          type="button"
          class="rounded-md px-2 py-1 text-sm text-ink-muted hover:bg-surface-muted hover:text-ink"
          onclick={closeNow}
        >
          Close
        </button>
      </div>

      <div class="mt-4">
        {@render children?.()}
      </div>
    </div>
  {/if}
</dialog>
