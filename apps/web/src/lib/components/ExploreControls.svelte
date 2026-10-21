<script lang="ts">
  /**
   * The controls of the **exploration** view.
   *
   * They are a row of controls and not a column: they live in the floating
   * toolbar, over the canvas, and the row scrolls sideways on a phone.
   *
   * Every control says what it does. The depth and the shape of the
   * arrows have a help text that only the screen reader reads, and the
   * scope of the picture is said out loud under the row.
   */
  import type { EdgeStyle } from '$lib/graph/explore/edge-style';
  import { EDGE_STYLES } from '$lib/graph/explore/edge-style';
  import { FOCUS_CRITERIA, type FocusCriterion } from '$lib/graph/explore/focus';
  import type { TranslationKey } from '$lib/i18n';
  import { getLocaleState } from '$lib/state/context';

  interface Props {
    /** The criterion that decides which node the view presents. */
    criterion: FocusCriterion;
    /** Called when the user changes the criterion. */
    oncriterionchange: (criterion: FocusCriterion) => void;
    /** The shape the relations are drawn with. */
    edgeStyle: EdgeStyle;
    /** Called when the user changes the shape of the relations. */
    onedgestylechange: (edgeStyle: EdgeStyle) => void;
    /** Whether the picture shows only the neighbourhood of the focus. */
    onlyNeighbourhood: boolean;
    /** Called when the user switches the far nodes on or off. */
    ononlyneighbourhoodchange: (only: boolean) => void;
    /** The depth of a walk. */
    depth: number;
    /** Called when the user changes the depth. */
    ondepthchange: (depth: number) => void;
    /** The id of the count of the picture — it is what the switch describes. */
    scopeCountId: string;
  }

  let {
    criterion,
    oncriterionchange,
    edgeStyle,
    onedgestylechange,
    onlyNeighbourhood,
    ononlyneighbourhoodchange,
    depth,
    ondepthchange,
    scopeCountId
  }: Props = $props();

  const locale = getLocaleState();
  const t = locale.t;

  /** The label of every criterion of the focus. */
  const FOCUS_LABELS: Record<FocusCriterion, TranslationKey> = {
    recent: 'explore.focusRecent',
    related: 'explore.focusRelated',
    manual: 'explore.focusManual'
  };

  /** The label of every shape of the relations. */
  const EDGE_STYLE_LABELS: Record<EdgeStyle, TranslationKey> = {
    straight: 'explore.edgeStraight',
    bezier: 'explore.edgeBezier',
    unbundled: 'explore.edgeUnbundled',
    arc: 'explore.edgeArc',
    haystack: 'explore.edgeHaystack'
  };

  /** The depths the API accepts. */
  const depthOptions = Array.from({ length: 4 }, (_, index) => index);

  /** The user changed the depth. */
  function handleDepthChange(event: Event): void {
    const select = event.currentTarget;

    if (!(select instanceof HTMLSelectElement)) {
      return;
    }

    ondepthchange(Number(select.value));
  }
</script>

<!--
  The row of the controls. It is a **scroller** on a narrow screen: the
  controls are many and a phone has no room for them side by side.
-->
<div
  class="flex flex-wrap items-end gap-x-4 gap-y-2 max-[48rem]:flex-nowrap max-[48rem]:overflow-x-auto max-[48rem]:pb-2"
  role="group"
  aria-label={t('explore.controlsLabel')}
>
  <fieldset class="min-w-0 shrink-0">
    <legend class="text-small text-muted">{t('explore.focusLabel')}</legend>
    <div class="mt-1 inline-flex gap-1 rounded-control bg-raised p-1">
      {#each FOCUS_CRITERIA as option (option)}
        <input
          type="radio"
          id="explore-focus-{option}"
          name="explore-focus"
          value={option}
          class="peer sr-only"
          checked={criterion === option}
          onchange={() => oncriterionchange(option)}
        />
        <label
          for="explore-focus-{option}"
          class="pointer-coarse:min-h-11 cursor-pointer rounded-control px-2.5 py-1 text-small font-medium text-muted hover:text-text peer-checked:bg-accent-soft peer-checked:font-semibold peer-checked:text-accent-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
        >
          {t(FOCUS_LABELS[option])}
        </label>
      {/each}
    </div>
  </fieldset>

  <!--
    The depth of a walk. It is the depth that is already selected in the
    whole app: the same number bounds the neighbourhood a click asks for
    and the subgraph of the other view.
  -->
  <div class="shrink-0">
    <label for="explore-depth" class="block text-small text-muted">
      {t('explore.depthLabel')}
    </label>
    <select
      id="explore-depth"
      class="field mt-0.5"
      value={depth}
      aria-describedby="explore-depth-help"
      onchange={handleDepthChange}
    >
      {#each depthOptions as option (option)}
        <option value={option}>{option}</option>
      {/each}
    </select>
    <p id="explore-depth-help" class="sr-only">
      {t('explore.depthHelp')}
    </p>
  </div>

  <div class="shrink-0">
    <label for="explore-edge-style" class="block text-small text-muted">
      {t('explore.edgeStyleLabel')}
    </label>
    <select
      id="explore-edge-style"
      class="field mt-0.5"
      value={edgeStyle}
      onchange={(event) => {
        const select = event.currentTarget;

        if (!(select instanceof HTMLSelectElement)) {
          return;
        }

        onedgestylechange(select.value as EdgeStyle);
      }}
    >
      {#each EDGE_STYLES as option (option)}
        <option value={option}>{t(EDGE_STYLE_LABELS[option])}</option>
      {/each}
    </select>
  </div>

  <!--
    The far nodes: the reader's choice. The switch says what it does and
    the numbers say the truth: how many nodes are in the picture and how
    many are hidden.
  -->
  <div class="min-w-0 shrink-0">
    <label
      for="explore-only-neighbourhood"
      class="flex items-center gap-2 text-small text-muted"
    >
      <input
        id="explore-only-neighbourhood"
        type="checkbox"
        class="size-[18px] accent-accent"
        checked={onlyNeighbourhood}
        aria-describedby="explore-only-neighbourhood-help {scopeCountId}"
        onchange={(event) => {
          const input = event.currentTarget;

          if (!(input instanceof HTMLInputElement)) {
            return;
          }

          ononlyneighbourhoodchange(input.checked);
        }}
      />
      {t('explore.onlyNeighbourhoodLabel')}
    </label>
    <p id="explore-only-neighbourhood-help" class="sr-only">
      {t('explore.onlyNeighbourhoodHelp')}
    </p>
  </div>
</div>
