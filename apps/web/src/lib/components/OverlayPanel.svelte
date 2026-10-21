<script lang="ts">
  /**
   * The panel that covers the content.
   *
   * It is the base of the two panels of the responsive layout — the drawer
   * of the navigation and the sheet of the inspector — and it is a **modal**:
   *
   * - the rest of the page is inert for a screen reader (`aria-hidden` and
   *   `inert`), because the panel is a sibling of the content and not a
   *   child of it;
   * - <kbd>Escape</kbd> closes it;
   * - the focus is trapped inside it while it is open;
   * - the focus goes back to the control that opened it when it closes.
   *
   * The panel is **always** in the DOM: the control that opens it points at
   * it with `aria-controls`, and a dangling reference is a broken
   * announcement. A closed panel is `aria-hidden` and `inert`, so a screen
   * reader and a keyboard never reach it.
   */
  import type { Snippet } from 'svelte';
  import { focusFirstControl, trapTabKey } from '$lib/a11y/focus-trap';
  import { portal } from './portal';

  interface Props {
    /** `true` while the panel is open. */
    open: boolean;
    /** The side the panel comes from. */
    side: 'left' | 'right';
    /** The name of the panel — it names it for the screen readers. */
    label: string;
    /** Called when the panel must close (the button, `Escape`, the backdrop). */
    onclose: () => void;
    /** The content of the panel. */
    children?: Snippet;
    /** The id of the panel — the control that opens it points at it. */
    panelId?: string;
    /** The extra classes of the panel. */
    panelClass?: string;
  }

  let { open, side, label, onclose, children, panelId, panelClass = '' }: Props = $props();

  const uid = $props.id();
  const id = $derived(panelId ?? `overlay-panel-${uid}`);

  /** The root of the portal: the panel and its backdrop live in the body. */
  let root: HTMLDivElement | undefined = $state();

  /** The panel itself. */
  let panel: HTMLDivElement | undefined = $state();

  /** The control that had the focus before the panel opened. */
  let opener: HTMLElement | null = null;

  /** The `aria-hidden` the background had before the panel opened. */
  let background = new Map<HTMLElement, string | null>();

  /**
   * Opens and closes the panel with the focus.
   *
   * The effect reads the panel and the state and nothing else: the content
   * of the panel is re-rendered by its own component, it never re-opens
   * this one.
   */
  $effect(() => {
    const element = panel;

    if (!open || element === undefined) {
      return;
    }

    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBackgroundInert(true);
    focusFirstControl(element);

    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onclose();
        return;
      }

      trapTabKey(event, element);
    };

    document.addEventListener('keydown', onKeydown);

    return () => {
      document.removeEventListener('keydown', onKeydown);
      setBackgroundInert(false);
      opener?.focus();
      opener = null;
    };
  });

  /**
   * The elements that are behind the panel.
   *
   * The panel is a child of the body: everything else in the body is the
   * background of the modal. An element with `display: contents` has no box
   * of its own, so the inertness has to reach the elements it holds.
   */
  function backgroundElements(): HTMLElement[] {
    const targets: HTMLElement[] = [];

    for (const child of Array.from(document.body.children)) {
      if (!(child instanceof HTMLElement) || child === root) {
        continue;
      }

      targets.push(child);

      if (getComputedStyle(child).display === 'contents') {
        for (const grandchild of Array.from(child.children)) {
          if (grandchild instanceof HTMLElement) {
            targets.push(grandchild);
          }
        }
      }
    }

    return targets;
  }

  /** Makes the background inert, or gives it back what it had. */
  function setBackgroundInert(inert: boolean): void {
    if (inert) {
      background = new Map();

      for (const element of backgroundElements()) {
        background.set(element, element.getAttribute('aria-hidden'));
        element.setAttribute('inert', '');
        element.setAttribute('aria-hidden', 'true');
      }

      return;
    }

    for (const [element, previous] of background) {
      element.removeAttribute('inert');

      if (previous === null) {
        element.removeAttribute('aria-hidden');
      } else {
        element.setAttribute('aria-hidden', previous);
      }
    }

    background = new Map();
  }
</script>

<!--
  The panel and its backdrop live in the body: the background of a modal
  has to be a sibling of the modal, or it would be inert with it.
-->
<div bind:this={root} use:portal class="contents">
  <!--
    The backdrop closes the panel when it is clicked: a convenience for the
    pointer. It is **not** in the tree of the screen reader — the panel has
    a close button of its own and `Escape` closes it too.
  -->
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    aria-hidden="true"
    class="fixed inset-0 z-40 bg-text/40 transition-opacity duration-200 {open ? 'opacity-100' : 'pointer-events-none opacity-0'}"
    onclick={onclose}
  ></div>

  <div
    bind:this={panel}
    id={id}
    role="dialog"
    aria-modal={open ? 'true' : undefined}
    aria-label={label}
    aria-hidden={open ? undefined : 'true'}
    inert={!open}
    tabindex="-1"
    class="fixed inset-y-0 z-50 flex flex-col overflow-y-auto border-rule bg-surface shadow-float transition-transform duration-200 {side === 'left' ? 'left-0 w-[min(20rem,85vw)] border-r' : 'right-0 w-[min(26rem,90vw)] border-l'} {open ? 'translate-x-0' : side === 'left' ? '-translate-x-full' : 'translate-x-full'} {panelClass}"
  >
    {@render children?.()}
  </div>
</div>
