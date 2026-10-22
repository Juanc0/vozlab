<script lang="ts">
  /**
   * The **tabs of the engines** — one engine at a time, in one space.
   *
   * The comparison is not a row of pictures: it is a **workspace** with a
   * tablist in its toolbar. The tabs are the pattern the inspector already
   * uses — a real tablist, one stop in the tab order, the arrow keys move
   * from one tab to the next and the tab they land on is the one that
   * becomes visible.
   *
   * The tab bar is a **quiet control**: the accent marks the selected tab
   * and nothing else in the interface competes with it.
   */
  import { getLocaleState } from '$lib/state/context';
  import { ENGINES, type EngineId } from './engines';

  interface Props {
    /** The engine that is on screen. */
    active: EngineId;
    /** Called when the reader picks another engine. */
    onselect: (engine: EngineId) => void;
    /** The id of the panel the tabs control — the space of the picture. */
    panelId: string;
    /**
     * The id of the tab of an engine.
     *
     * The **page** owns the ids: the panel of the tabs is labelled by the
     * tab that is on screen, and the two must agree.
     */
    tabId: (engine: EngineId) => string;
  }

  let { active, onselect, panelId, tabId }: Props = $props();

  const locale = getLocaleState();
  const t = locale.t;

  /**
   * Moves between the tabs with the keyboard.
   *
   * The tablist is a single stop in the tab order: the arrow keys move from
   * one tab to the next, and the tab they land on is the one that becomes
   * visible.
   *
   * @param event - The key the reader pressed.
   * @param index - The tab the key was pressed on.
   */
  function onTabKeydown(event: KeyboardEvent, index: number): void {
    const last = ENGINES.length - 1;
    let next: number | null = null;

    if (event.key === 'ArrowRight') {
      next = index === last ? 0 : index + 1;
    } else if (event.key === 'ArrowLeft') {
      next = index === 0 ? last : index - 1;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = last;
    }

    if (next === null) {
      return;
    }

    const engine = ENGINES[next];

    if (engine === undefined) {
      return;
    }

    event.preventDefault();
    onselect(engine.id);
    document.getElementById(tabId(engine.id))?.focus();
  }
</script>

<!--
  The tablist. The accent is on the **underline** of the selected tab and
  nowhere else: the picture behind it is the thing the reader is looking
  at, and a second mark would compete with it.
-->
<div
  role="tablist"
  aria-label={t('engines.tabsLabel')}
  class="flex gap-4 overflow-x-auto border-b border-rule [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
>
  {#each ENGINES as engine, index (engine.id)}
    <button
      type="button"
      role="tab"
      id={tabId(engine.id)}
      aria-selected={active === engine.id}
      aria-controls={panelId}
      tabindex={active === engine.id ? 0 : -1}
      class="-mb-px shrink-0 border-b-2 border-transparent pb-2 text-body font-medium text-muted hover:text-text aria-[selected=true]:border-accent aria-[selected=true]:text-text"
      onclick={() => onselect(engine.id)}
      onkeydown={(event) => onTabKeydown(event, index)}
    >
      {t(engine.nameKey)}
    </button>
  {/each}
</div>
