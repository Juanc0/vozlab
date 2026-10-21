<script lang="ts">
  /**
   * The sheet of the inspector.
   *
   * Below `xl` the inspector is not the last thing of the page: it is a
   * sheet that comes from the right over the content. It is a **modal** —
   * the content behind it is inert, <kbd>Escape</kbd> closes it and the
   * focus goes back to the control that opened it.
   *
   * The sheet and the drawer are the same panel in two directions: they
   * share the implementation of `./OverlayPanel`.
   */
  import type { Snippet } from 'svelte';
  import { getLocaleState } from '$lib/state/context';
  import OverlayPanel from './OverlayPanel.svelte';

  interface Props {
    /** `true` while the sheet is open. */
    open: boolean;
    /** Called when the sheet must close. */
    onclose: () => void;
    /** The content of the sheet — the inspector. */
    children?: Snippet;
    /** The id of the panel — the control that opens it points at it. */
    panelId?: string;
  }

  let { open, onclose, children, panelId }: Props = $props();

  const locale = getLocaleState();
  const t = locale.t;
</script>

<OverlayPanel {open} side="right" {panelId} label={t('sheet.label')} {onclose}>
  <div class="flex h-full flex-col">
    <div class="flex items-center justify-between gap-3 border-b border-rule p-4">
      <h2>{t('sheet.heading')}</h2>
      <button
        type="button"
        class="-mr-2 grid size-11 place-items-center rounded-control text-muted hover:bg-raised hover:text-text"
        aria-label={t('sheet.close')}
        onclick={onclose}
      >
        <span aria-hidden="true" class="text-section leading-none">✕</span>
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-4">
      {@render children?.()}
    </div>
  </div>
</OverlayPanel>
