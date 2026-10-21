<script module lang="ts">
  /**
   * The id of the panel of the drawer.
   *
   * The button of the header points at it with `aria-controls`: the drawer
   * is the navigation of a narrow screen, and the button has to say what it
   * controls.
   */
  export const DRAWER_PANEL_ID = 'vozlab-navigation-drawer';
</script>

<script lang="ts">
  /**
   * The drawer of the navigation.
   *
   * Below `md` the navigation is not a column: it is a drawer that comes
   * from the left over the content. It is a **modal** — the content behind
   * it is inert, <kbd>Escape</kbd> closes it and the focus goes back to the
   * button that opened it.
   *
   * The drawer and the sheet are the same panel in two directions: they
   * share the implementation of `./OverlayPanel`.
   */
  import type { Snippet } from 'svelte';
  import { getLocaleState } from '$lib/state/context';
  import OverlayPanel from './OverlayPanel.svelte';

  interface Props {
    /** `true` while the drawer is open. */
    open: boolean;
    /** Called when the drawer must close. */
    onclose: () => void;
    /** The content of the drawer — the navigation. */
    children?: Snippet;
  }

  let { open, onclose, children }: Props = $props();

  const locale = getLocaleState();
  const t = locale.t;
</script>

<OverlayPanel {open} side="left" panelId={DRAWER_PANEL_ID} label={t('drawer.label')} {onclose}>
  <div class="flex h-full flex-col">
    <div class="flex items-center justify-between gap-3 border-b border-line p-4">
      <h2 class="text-base font-semibold tracking-tight">{t('drawer.heading')}</h2>
      <button
        type="button"
        class="-mr-2 grid size-11 place-items-center rounded-md text-ink hover:bg-surface-muted"
        aria-label={t('drawer.close')}
        onclick={onclose}
      >
        <span aria-hidden="true" class="text-lg leading-none">✕</span>
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-4">
      {@render children?.()}
    </div>
  </div>
</OverlayPanel>
