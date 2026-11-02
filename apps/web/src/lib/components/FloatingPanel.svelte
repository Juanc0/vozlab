<script lang="ts">
  /**
   * A panel that **floats** over the canvas.
   *
   * A floating panel is the one thing the design system allows a shadow on:
   * it truly floats over the picture, and the picture behind it is the same
   * ground the panel is on — so the panel carries a **border** in
   * `--color-border` to say "I am over it" and not "there is a hole here".
   *
   * It is a **solid** surface: no glass, no backdrop blur. The house rules
   * ban both, and a blurred panel over a graph makes the graph unreadable
   * exactly where the reader is looking.
   */
  import type { Snippet } from 'svelte';

  interface Props {
    /** Where the panel floats inside the workspace. */
    placement?: 'top-left' | 'top-right' | 'bottom-left';
    /**
     * The name of the panel.
     *
     * A named `<section>` is a region: the screen reader can jump to it.
     */
    label?: string;
    /** The id of the panel — the control that opens it points at it. */
    id?: string;
    /** The extra classes of the panel — its width, its height. */
    panelClass?: string;
    /**
     * `true` when the panel is folded away.
     *
     * The panel stays in the document: the control that opens it points at
     * it with `aria-controls`, and a dangling reference is a broken
     * announcement.
     */
    hidden?: boolean;
    /** The element of the panel — the page measures it. */
    element?: HTMLElement | undefined;
    children?: Snippet;
  }

  let {
    placement = 'top-left',
    label,
    id,
    panelClass = '',
    hidden = false,
    element = $bindable(undefined),
    children
  }: Props = $props();

  const PLACEMENT: Record<NonNullable<Props['placement']>, string> = {
    // The panel of the bottom leaves room for the toast of the notices of
    // the shell: it is in the same corner of the window.
    'top-left': 'left-4 top-4',
    'top-right': 'right-4 top-4',
    'bottom-left': 'left-4 bottom-[calc(var(--notice-h,0px)+1rem)]'
  };
</script>

<!--
  The panel is `absolute` inside the workspace: it does **not** take part in
  the flow, so opening it does not change the size of the canvas under it.
  The picture stays exactly where the reader left it.
-->
<section
  bind:this={element}
  {id}
  aria-label={label}
  class="pointer-events-auto absolute z-10 rounded-card border border-border bg-surface shadow-float {PLACEMENT[placement]} {panelClass} {hidden ? 'hidden' : ''}"
>
  {@render children?.()}
</section>
