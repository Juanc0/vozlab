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
    placement?: 'top-left' | 'top-right' | 'bottom-left' | 'top';
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
     * `true` when the panel is flat.
     *
     * The elevation of a floating panel is a **tone step** in the surfaces
     * that sit directly on the ground: a surface over the ground is already
     * the step, and a shadow there is a second way of saying the same
     * thing. The workspace that compares the engines uses it so the panels
     * do not turn into cards over the picture.
     */
    flat?: boolean;
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
    /** An inline style of the panel — its exact offset. */
    style?: string;
    children?: Snippet;
  }

  let {
    placement = 'top-left',
    label,
    id,
    panelClass = '',
    flat = false,
    hidden = false,
    element = $bindable(undefined),
    style,
    children
  }: Props = $props();

  const PLACEMENT: Record<NonNullable<Props['placement']>, string> = {
    // The panel of the bottom leaves room for the toast of the notices of
    // the shell: it is in the same corner of the window.
    'top-left': 'left-4 top-4',
    'top-right': 'right-7 top-4',
    'bottom-left': 'left-4 bottom-[calc(var(--notice-h,0px)+1rem)] lg:left-0',
    // The toolbar is the frame of the top of the picture. In a narrow
    // screen it floats with the same air as the other panels; above `lg`
    // its left side is the gap the shell's grid already puts between the
    // navigation and the content, so the top and the right get the very
    // same air: one gap of `gap-7` on the three sides that face a border.
    'top': 'left-4 right-4 top-4 lg:left-0 lg:right-7 lg:top-7'
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
  {style}
  aria-label={label}
  class="pointer-events-auto absolute z-10 rounded-card bg-brand-100 {flat
    ? ''
    : 'border border-brand-200 shadow-float'} {PLACEMENT[placement]} {panelClass} {hidden ? 'hidden' : ''}"
>
  {@render children?.()}
</section>
