<script lang="ts">
  /**
   * The controls of the **zoom** of the picture.
   *
   * They are **quiet** controls: the accent of the interface is scarce and
   * the zoom is not the accent of the screen — it is a utility, and it
   * wears the muted ink like the rest of the row of the toolbar.
   *
   * The zoom belongs to the **reader**: the wheel and the pinch change it,
   * and these three buttons are the way of changing it without a pointer
   * that scrolls. They are real buttons: the keyboard reaches them, and
   * every one of them says what it does.
   */
  import { getLocaleState } from '$lib/state/context';

  interface Props {
    /** Comes closer to the picture. */
    onzoomin?: () => void;
    /** Goes away from the picture. */
    onzoomout?: () => void;
    /** Puts the whole picture in view — the fit. */
    onfit?: () => void;
  }

  let { onzoomin, onzoomout, onfit }: Props = $props();

  const locale = getLocaleState();
  const t = locale.t;
</script>

<!--
  The group of the three controls. It is one stop in the tab order and the
  label says what it is: the zoom of the picture.
-->
<div role="group" aria-label={t('explore.zoomLabel')} class="shrink-0">
  <span class="block text-small text-muted">
    {t('explore.zoomTitle')}
  </span>
  <div class="mt-1 inline-flex items-center gap-1">
    <button
      type="button"
      class="btn btn-quiet px-2 text-body"
      aria-label={t('explore.zoomOut')}
      onclick={() => onzoomout?.()}
    >
      <span aria-hidden="true">−</span>
    </button>
    <button
      type="button"
      class="btn btn-quiet px-2 text-body"
      aria-label={t('explore.zoomFit')}
      onclick={() => onfit?.()}
    >
      {t('explore.zoomFitShort')}
    </button>
    <button
      type="button"
      class="btn btn-quiet px-2 text-body"
      aria-label={t('explore.zoomIn')}
      onclick={() => onzoomin?.()}
    >
      <span aria-hidden="true">+</span>
    </button>
  </div>
</div>
